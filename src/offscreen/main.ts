// The offscreen document: fetch the audio, decode it, transcribe it in chunks.
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

import { fetchAudioTrack } from '../bilibili/audio'
import type { Cue } from '../bilibili/subtitles'
import { transcribe } from '../llm/asr'
import { mergeCues, nextChunk, ownedCues, planChunks, type Chunk } from '../llm/chunks'
import { log } from '../llm/log'
import { ASR_SAMPLE_RATE, downmixToMono, encodeWav, sliceSeconds } from '../llm/wav'
import {
  isOffscreenRequest,
  type OffscreenEvent,
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

  const done = (cues: Cue[], error?: string) => {
    if (running === controller) running = null
    if (error) note('error', error)
    send({ type: 'bb-subsgen:offscreen-done', videoId, cues, ...(error ? { error } : {}) })
  }

  try {
    note('info', `Asking Bilibili for the audio of ${videoId} (cid ${request.cid})`)

    const track = await fetchAudioTrack({ videoId, cid: request.cid, signal })
    if (!track) return done([], 'No audio stream for this video.')

    const chunks = planChunks(track.duration, { playhead })
    if (!chunks.length) return done([], 'This video reports no duration.')

    note(
      'info',
      `Transcribing ${Math.round(track.duration)}s of audio in ${chunks.length} chunks ` +
        `at ${Math.round(track.stream.bandwidth / 1000)}kbps`,
      new URL(track.stream.url).host,
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
      cues: [],
      covered: [],
    })

    const response = await fetch(track.stream.url, { credentials: 'omit', signal })
    if (!response.ok) return done([], `Could not fetch the audio: ${response.status}`)

    const bytes = await response.arrayBuffer()
    note('info', `Decoding ${(bytes.byteLength / 1e6).toFixed(1)}MB of audio`)

    const samples = await decodeToMono(bytes)
    note('info', `Decoded ${Math.round(samples.length / ASR_SAMPLE_RATE)}s at ${ASR_SAMPLE_RATE}Hz`)

    // Keyed by chunk so the merge stays correct however the chunks are ordered.
    const byChunk = new Map<number, Cue[]>()
    const spans = new Map<number, [number, number]>()
    const remaining = new Set<Chunk>(chunks)

    // `nextChunk` rather than a fixed order, asked again every time round: a
    // seek arrives as a message minutes into the run, and re-reading the
    // playhead here is the whole of what makes it re-order the work. The chunk
    // already in flight is never abandoned for it — hanging up mid-encode is
    // what the speech server reports as a client disconnect, and it would throw
    // away a chunk that is nearly done.
    for (let chunk = nextChunk(remaining, playhead); chunk; chunk = nextChunk(remaining, playhead)) {
      if (signal.aborted) return
      remaining.delete(chunk)

      const audio = encodeWav(sliceSeconds(samples, chunk.audioStart, chunk.audioEnd))
      const heard = await transcribe({
        baseUrl: request.baseUrl,
        model: request.model,
        audio,
        // Timings come back relative to the chunk; this puts them back on the track.
        offset: chunk.audioStart,
        signal,
        log,
      })

      // The padding either side is what the model heard, not what it may report.
      byChunk.set(chunk.index, ownedCues(heard, chunk))
      // What the chunk owned, not what it found: a stretch with no speech in it
      // is covered by having been listened to, and the overlay needs to know
      // that or it goes on reporting a chunk that is finished.
      spans.set(chunk.index, [chunk.start, chunk.end])

      send({
        type: 'bb-subsgen:offscreen-progress',
        videoId,
        done: byChunk.size,
        total: chunks.length,
        cues: mergeCues(byChunk.values()),
        covered: [...spans.values()],
      })
    }

    done(mergeCues(byChunk.values()))
  } catch (e) {
    if (signal.aborted) {
      if (running === controller) running = null
      return
    }
    note('error', 'Transcription stopped', String(e))
    done([], e instanceof Error ? e.message : String(e))
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
  playhead = msg.playhead
  void run(msg)
})
