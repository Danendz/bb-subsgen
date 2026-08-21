// The offscreen document: decode the audio and transcribe it in chunks.
//
// It exists because of two platform limits that between them rule out every
// other place this could run:
//
//   - A service worker has no `AudioContext` or `OfflineAudioContext`. Bilibili
//     serves AAC, and decoding it is exactly what the worker cannot do.
//   - A content script could decode, but its fetches carry the page's origin, so
//     they are subject to CORS and Chrome blocks a public page from reaching
//     localhost outright — see the header of llm/client.ts.
//
// An offscreen document is the one context that is both a DOM and the extension
// origin, so it can do both halves.
//
// The download may go either way, and the request says which. Bilibili's CDN
// wants a bilibili referrer, which is the one thing an extension page cannot
// send, so those bytes come via the content script — see `askPageForAudio`. A
// localhost helper is the opposite: reachable from here, and blocked outright
// for a public page. Being the extension origin is what makes localhost
// reachable and the CDN unreachable; `AudioSource.via` names which side of that
// line a given track falls on.
//
// What this file deliberately does not know is *which site* it is transcribing.
// It used to: it called Bilibili's playurl API itself, which is why a `cid` had
// to be threaded through the content script, the worker and the protocol to
// reach it. The audio is now located by whoever knows the site and arrives here
// already resolved.

import type { Cue } from '../media/cue'
import { transcribeWithRetry } from '../llm/asr'
import {
  chunkFor,
  coverageExcept,
  mergeCues,
  nextChunk,
  ownedCues,
  planChunks,
  type Chunk,
} from '../llm/chunks'
import { log } from '../llm/log'
import { ASR_SAMPLE_RATE, decodeWav, downmixToMono, encodeWav, sliceSeconds } from '../llm/wav'
import { collectAudio } from './audio-transfer'
import {
  isOffscreenRequest,
  type AudioSupply,
  type OffscreenEvent,
  type TranscribeDone,
  type TranscribeRequest,
} from './protocol'

/** One run at a time: there is one GPU behind this, as there is behind the pass. */
let running: AbortController | null = null

/**
 * Where playback is, re-read before every chunk rather than fixed at the start.
 *
 * Module scope because a seek arrives as its own message, minutes after the
 * request that began the run.
 */
let playhead = 0

function send(event: OffscreenEvent): void {
  // The worker may have been torn down between chunks; that is not an error, and
  // the transcript it would have cached is rebuilt on the next viewing.
  void chrome.runtime.sendMessage(event).catch(() => {})
}

/**
 * The whole audio track, as mono samples at the rate speech models want.
 *
 * `decodeAudioData` resamples to its context's rate, so a context created at the
 * ASR rate does the resampling as part of the decode rather than as a second
 * pass over hundreds of megabytes.
 *
 * This is the memory high-water mark of the feature: the decode holds the
 * source's own channels and rate briefly before the downmix, so a fifty-minute
 * stereo episode peaks in the high hundreds of megabytes. The reason it is done
 * once for the track rather than per chunk is that `decodeAudioData` needs a
 * complete container — an MP4's index lives at one end of the file, so there is
 * no prefix of the bytes that decodes to a prefix of the audio.
 */
async function decodeToMono(bytes: ArrayBuffer): Promise<Float32Array> {
  const context = new OfflineAudioContext(1, 1, ASR_SAMPLE_RATE)
  return downmixToMono(await context.decodeAudioData(bytes))
}

/**
 * The samples, however they arrived.
 *
 * Audio from the local helper is already mono PCM at the ASR rate — ffmpeg did
 * the resampling — so it is read straight out of its container and the Web Audio
 * decode is skipped entirely. That is the difference between one flat copy and
 * the memory peak described above.
 *
 * Chosen by looking at the bytes rather than by a flag on the request. The two
 * cases are not ambiguous: a WAV says `RIFF`/`WAVE` in its first twelve bytes,
 * and no site serves its media as uncompressed PCM. Sniffing also means a helper
 * that starts emitting something else keeps working instead of producing
 * silence, which a declared format would not.
 *
 * The rate and channel count are checked, not assumed. A WAV at some other rate
 * would decode perfectly and then be *chunked* wrongly — `sliceSeconds` counts in
 * samples at `ASR_SAMPLE_RATE` — so anything unexpected goes the long way round,
 * where the audio context resamples it properly.
 */
async function samplesFrom(bytes: ArrayBuffer): Promise<Float32Array> {
  const wav = decodeWav(bytes)
  if (wav && wav.sampleRate === ASR_SAMPLE_RATE && wav.channels === 1) return wav.samples
  if (wav) {
    console.warn(
      `[bb-subsgen] wav is ${wav.sampleRate}Hz/${wav.channels}ch, not ${ASR_SAMPLE_RATE}Hz mono` +
        ' — resampling it the long way',
    )
  }
  return decodeToMono(bytes)
}

/**
 * Whoever is waiting on the page to hand over an audio download.
 *
 * Module scope because the answer arrives as its own message rather than as a
 * reply, and so lands in the listener at the bottom of this file rather than
 * anywhere the run can see. At most one, for the same reason there is at most
 * one `running`.
 */
let awaitingAudio: ((supply: AudioSupply) => void) | null = null

/**
 * Asks the content script to download a stream, because it is allowed to and
 * this document is not. See `fetchAudioBytes` for what the CDN is checking.
 *
 * Resolves rather than rejects on failure: the page reports why it could not,
 * and that sentence is what the overlay should show. A cancelled run rejects,
 * which is the existing path for an abort part way through.
 */
function askPageForAudio(
  videoId: string,
  url: string,
  signal: AbortSignal,
): Promise<{ bytes?: ArrayBuffer; error?: string }> {
  return new Promise((resolve, reject) => {
    const collector = collectAudio()

    const settle = (supply: AudioSupply) => {
      // A run that has been superseded may still have slices in flight, and they
      // are audio nobody is transcribing any more.
      if (supply.videoId !== videoId) return
      if (supply.error || supply.data === undefined) {
        awaitingAudio = null
        resolve({ error: supply.error ?? 'Could not fetch the audio.' })
        return
      }

      const whole = collector.add({
        data: supply.data,
        index: supply.index ?? 0,
        total: supply.total ?? 1,
      })
      // Null while slices are still outstanding; the next one resolves this.
      if (!whole) return
      awaitingAudio = null
      resolve({ bytes: whole })
    }
    awaitingAudio = settle

    signal.addEventListener(
      'abort',
      () => {
        if (awaitingAudio === settle) awaitingAudio = null
        reject(new DOMException('Cancelled', 'AbortError'))
      },
      { once: true },
    )

    send({ type: 'bb-subsgen:offscreen-need-audio', videoId, url })
  })
}

/**
 * Downloads audio this document is allowed to fetch itself.
 *
 * The localhost half of the split described at the top of this file. Resolves
 * rather than rejects on failure for the same reason `askPageForAudio` does:
 * the sentence explaining what went wrong is what the overlay should show, and
 * a helper that is not running is the most likely thing to have gone wrong.
 */
async function fetchAudioDirectly(
  url: string,
  signal: AbortSignal,
): Promise<{ bytes?: ArrayBuffer; error?: string }> {
  try {
    const resp = await fetch(url, { signal })
    if (!resp.ok) {
      // The helper answers a failed download with the reason in the body — a
      // dead video, a geo-block, a yt-dlp too old for what the site is serving
      // now. That sentence is worth far more than the status code.
      const detail = (await resp.text().catch(() => '')).trim().slice(0, 200)
      return { error: `Could not fetch the audio: ${resp.status}${detail ? ` — ${detail}` : ''}` }
    }
    return { bytes: await resp.arrayBuffer() }
  } catch (e) {
    if (signal.aborted) throw new DOMException('Cancelled', 'AbortError')
    return {
      error: `Could not reach the audio helper: ${e instanceof Error ? e.message : String(e)}`,
    }
  }
}

async function run(request: TranscribeRequest): Promise<void> {
  running?.abort()
  const controller = new AbortController()
  running = controller
  const { signal } = controller

  const { videoId } = request

  // Every stage reports, because between them they are minutes of silence: the
  // audio is tens of megabytes to fetch and hundreds to decode, and a run that
  // has not reached the server yet looks exactly like one the server ignored.
  const note = (level: 'info' | 'error', message: string, detail?: string) =>
    log({ level, kind: 'transcribe', requestId: videoId, model: request.model, message, detail })

  const done = (
    cues: Cue[],
    extra: Partial<Omit<TranscribeDone, 'type' | 'videoId' | 'cues'>> = {},
  ) => {
    const { done: did = 0, total = 0, failed = [], error } = extra
    if (running === controller) running = null
    if (error) note('error', error)
    send({
      type: 'bb-subsgen:offscreen-done',
      videoId,
      cues,
      done: did,
      total,
      failed,
      ...(error ? { error } : {}),
    })
  }

  /**
   * How the run reports itself, whether it ran out of chunks or threw.
   *
   * Replaced once there is a chunk plan to report against, so that a permanent
   * failure part way through still keeps — and still caches — the chunks that
   * did work. Until then there is nothing to report but the error.
   */
  let lastError = ''
  let report = () => done([], { error: lastError })

  try {
    const { audio } = request

    // A run handed `only` is picking up the stretches a previous one could not
    // fill, and takes them as given rather than re-planning: the plan depends on
    // where playback was when it was made, so a second one would cut the track
    // differently and the same gap would name different audio.
    const seeded = request.seed ?? []
    const chunks = request.only?.length
      ? request.only.map((span, index) => chunkFor(span, index, audio.durationSeconds))
      : planChunks(audio.durationSeconds, { playhead })
    if (!chunks.length) return done([], { error: 'This video reports no duration.' })

    note(
      'info',
      seeded.length
        ? `Resuming ${videoId}: ${seeded.length} lines already in hand, ` +
            `${chunks.length} stretch${chunks.length === 1 ? '' : 'es'} to redo`
        : `Transcribing ${Math.round(audio.durationSeconds)}s of audio in ` +
            `${chunks.length} chunks`,
      new URL(audio.url).host,
    )

    // Reported the moment the plan exists, not when the first chunk lands. The
    // download and the decode alone are tens of seconds, and a chunk is minutes
    // more — leaving the overlay on a bare "Transcribing…" for all of that, with
    // no denominator, is indistinguishable from nothing happening.
    send({
      type: 'bb-subsgen:offscreen-progress',
      videoId,
      done: 0,
      total: chunks.length,
      cues: seeded,
      covered: coverageExcept(chunks, audio.durationSeconds),
    })

    note('info', `Fetching the audio ${audio.via === 'page' ? 'through the page' : 'directly'}`)
    const supply =
      audio.via === 'page'
        ? await askPageForAudio(videoId, audio.url, signal)
        : await fetchAudioDirectly(audio.url, signal)
    if (!supply.bytes) {
      return done([], { error: supply.error ?? 'Could not fetch the audio.' })
    }

    const bytes = supply.bytes
    note('info', `Decoding ${(bytes.byteLength / 1e6).toFixed(1)}MB of audio`)

    const samples = await samplesFrom(bytes)
    note('info', `Decoded ${Math.round(samples.length / ASR_SAMPLE_RATE)}s at ${ASR_SAMPLE_RATE}Hz`)

    // Keyed by chunk so the merge stays correct however the chunks are ordered.
    const byChunk = new Map<number, Cue[]>()
    /**
     * Two sets, because "not attempted yet" and "not transcribed" stop being the
     * same thing the moment a chunk is allowed to fail.
     *
     * Every chunk leaves `todo`, or one that failed would be picked again on the
     * very next iteration and the loop would never end. `unfinished` loses only
     * the ones that worked: its complement is what has lines, and whatever is
     * left in it at the end is exactly what a retry should ask for.
     */
    const todo = new Set<Chunk>(chunks)
    const unfinished = new Set<Chunk>(chunks)

    const gaps = (): Array<[number, number]> =>
      [...unfinished].sort((a, b) => a.start - b.start).map((chunk) => [chunk.start, chunk.end])
    const cuesSoFar = () => mergeCues([seeded, ...byChunk.values()])

    report = () => {
      const failed = gaps()
      done(cuesSoFar(), {
        done: byChunk.size,
        total: chunks.length,
        failed,
        ...(failed.length
          ? {
              error:
                `${failed.length} of ${chunks.length} stretch${failed.length === 1 ? '' : 'es'} ` +
                `could not be transcribed. ${lastError}`.trim(),
            }
          : {}),
      })
    }

    // `nextChunk` rather than a fixed order, asked again every time round: a
    // seek arrives as a message minutes into the run, and re-reading the
    // playhead here is the whole of what makes it re-order the work. The chunk
    // already in flight is never abandoned for it — hanging up mid-encode is
    // what the speech server reports as a client disconnect, and it would throw
    // away a chunk that is nearly done.
    for (let chunk = nextChunk(todo, playhead); chunk; chunk = nextChunk(todo, playhead)) {
      if (signal.aborted) return
      todo.delete(chunk)

      const wav = encodeWav(sliceSeconds(samples, chunk.audioStart, chunk.audioEnd))
      const heard = await transcribeWithRetry({
        baseUrl: request.baseUrl,
        model: request.model,
        audio: wav,
        // Timings come back relative to the chunk; this puts them back on the track.
        offset: chunk.audioStart,
        label: `${Math.round(chunk.start)}s–${Math.round(chunk.end)}s`,
        signal,
        log,
      })
      if (signal.aborted) return

      if (heard.cues) {
        unfinished.delete(chunk)
        // The padding either side is what the model heard, not what it may report.
        byChunk.set(chunk.index, ownedCues(heard.cues, chunk))
      } else if (heard.error) {
        lastError = heard.error
      }

      send({
        type: 'bb-subsgen:offscreen-progress',
        videoId,
        done: byChunk.size,
        total: chunks.length,
        cues: cuesSoFar(),
        // From what is unfinished rather than from what is done, so the stretch
        // a failed chunk owns goes on reporting itself as missing.
        covered: coverageExcept(unfinished, audio.durationSeconds),
      })
    }

    report()
  } catch (e) {
    if (signal.aborted) {
      if (running === controller) running = null
      return
    }
    lastError = e instanceof Error ? e.message : String(e)
    note('error', 'Transcription stopped', lastError)
    // Through `report` so a permanent failure part way through still hands back
    // the chunks that did work, and still says which stretches did not.
    report()
  }
}

chrome.runtime.onMessage.addListener((msg) => {
  if (!isOffscreenRequest(msg)) return

  if (msg.type === 'bb-subsgen:offscreen-cancel') {
    running?.abort()
    running = null
    return
  }
  if (msg.type === 'bb-subsgen:offscreen-playhead') {
    playhead = msg.seconds
    return
  }
  if (msg.type === 'bb-subsgen:offscreen-audio') {
    awaitingAudio?.(msg)
    return
  }
  playhead = msg.playhead
  void run(msg)
})
