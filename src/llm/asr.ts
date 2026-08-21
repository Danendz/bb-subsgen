// Turning audio into timed Chinese lines, with a local speech-recognition server.
//
// The same contract as client.ts, for the same reason: `/v1/audio/transcriptions`
// is what speaches, faster-whisper-server and the rest all speak, so which one is
// on the other end never has to be asked — and swapping the model for a
// Mandarin-tuned one is a settings change rather than a code change. whisper.cpp
// serves the same thing at a different path; see `endpointsFor`.
//
// The same origin rule applies too. This runs on the extension origin only (the
// worker, the offscreen document); a content script's fetches carry the page's
// origin, so they are subject to CORS and Chrome blocks a public page from
// reaching localhost outright.
//
// Why this module exists at all: most of bangumi has no subtitle track. Surveyed
// across a season of 航拍中国, zero of the six real episodes returned one. The
// lines are in the audio, and the audio is a plain DASH file that can be fetched
// and transcribed *before* playback reaches it — which is the property that lets
// the results feed the existing pipeline unchanged, and the property that reading
// the burned-in subtitles off the video could never have.

import { connectionError, failureBody, normalizeBaseUrl, LlmError } from './client'
import { newRequestId, noLog, type LlmLogger } from './types'
import type { Cue } from '../media/cue'

/** Ready-made base URLs for the two servers most likely to be installed. */
export const ASR_PRESETS: ReadonlyArray<{ label: string; baseUrl: string }> = [
  { label: 'whisper.cpp', baseUrl: 'http://localhost:8080/v1' },
  { label: 'speaches', baseUrl: 'http://localhost:8000/v1' },
]

/**
 * How long to wait before each retry of a chunk, in milliseconds.
 *
 * Its length is how many attempts a chunk gets, less the first. Spaced rather
 * than immediate because the failure worth retrying is a server that has gone
 * away — restarted, still loading its model, briefly out of memory — and asking
 * again in the same millisecond only reproduces it.
 */
export const ASR_BACKOFF_MS: readonly number[] = [2000, 8000]

/**
 * Whether asking again could plausibly give a different answer.
 *
 * The distinction is worth drawing because a chunk is a minute of work and a
 * fifty-minute episode is ten of them: retrying a permanent failure three times
 * per chunk turns one wrong address into thirty doomed requests and several
 * minutes before anything is said about it.
 *
 * A refusal carrying no status is a connection that could not be made at all,
 * which is exactly the transient case. A 5xx is the server failing rather than
 * declining. Everything else — a 4xx, and in particular the 404 meaning no
 * transcription endpoint lives at this address — is a settled answer that will
 * be identical for every remaining chunk.
 */
export function isRetryable(error: unknown): boolean {
  if (!(error instanceof LlmError)) return false
  if (error.status === undefined) return true
  return error.status >= 500 || error.status === 408 || error.status === 429
}

/** Waits, unless the run is cancelled first. */
function pause(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        resolve()
      },
      { once: true },
    )
  })
}

export interface RetryingOptions extends TranscribeOptions {
  /** Names the stretch in the log lines. */
  label?: string
  /** Injectable so a test does not actually wait eight seconds. */
  wait?: (ms: number, signal?: AbortSignal) => Promise<void>
}

export interface Attempted {
  /** Null when it never answered, or when the run was cancelled. */
  cues: Cue[] | null
  /** The last thing the server said, for reporting what went wrong. */
  error?: string
}

/**
 * One piece of audio, asked for until it answers or the attempts run out.
 *
 * A piece that never answers is *reported*, not thrown: the caller transcribes a
 * whole episode a chunk at a time, and one bad chunk must not cost the other
 * forty-five minutes. That is the rule `startPass` follows for a failed batch.
 *
 * A failure that will be identical for every remaining chunk is thrown instead,
 * which ends the caller's run. That distinction is the point — without it, one
 * wrong address becomes thirty doomed requests and a minute of backoff before
 * anything is said about it.
 */
export async function transcribeWithRetry(opts: RetryingOptions): Promise<Attempted> {
  const { label = 'this stretch', wait = pause, ...rest } = opts
  const log = opts.log ?? noLog

  for (let at = 0; ; at++) {
    try {
      return { cues: await transcribe(rest) }
    } catch (e) {
      if (rest.signal?.aborted) return { cues: null }
      if (!isRetryable(e)) throw e

      const error = e instanceof Error ? e.message : String(e)
      const delay = ASR_BACKOFF_MS[at]
      if (delay === undefined) {
        log({
          level: 'error',
          kind: 'transcribe',
          requestId: label,
          model: rest.model,
          message: `Giving up on ${label} after ${ASR_BACKOFF_MS.length + 1} attempts`,
          detail: error,
        })
        return { cues: null, error }
      }

      log({
        level: 'warn',
        kind: 'transcribe',
        requestId: label,
        model: rest.model,
        message: `${label} failed; retrying in ${delay / 1000}s`,
        detail: error,
      })
      await wait(delay, rest.signal)
    }
  }
}

/**
 * The formats asked for, in order of preference.
 *
 * `verbose_json` is the one that carries per-segment timings as numbers, and is
 * what every server that implements the endpoint properly returns. `srt` is the
 * fallback because it is the oldest and most universally implemented format
 * there is — a server that ignores `response_format` entirely, or that knows
 * only the plain `json` shape with no timings in it, will still produce this.
 * Timings are not optional here: a line without them cannot be shown against a
 * video at all.
 */
const FORMATS = ['verbose_json', 'srt'] as const

/**
 * The paths tried, in order, until one is not a 404.
 *
 * `/v1/audio/transcriptions` is the contract this module is written against and
 * the one speaches, faster-whisper-server and the rest implement. whisper.cpp's
 * own `whisper-server` is the exception: it answers that path with a plain
 * `File Not Found` and serves the same thing at `/inference` off the root
 * instead — note *off the root*, not under `/v1`, so it cannot be reached by
 * changing the configured address. Since whisper.cpp is what `tools/asr-server.sh`
 * installs, not trying it here would mean the recommended server was the one
 * server that did not work.
 *
 * The bodies are identical, so nothing downstream has to know which answered.
 */
export function endpointsFor(base: string): string[] {
  const urls = [`${base}/audio/transcriptions`]
  try {
    const native = new URL('/inference', base).toString()
    if (!urls.includes(native)) urls.push(native)
  } catch {
    // An address too malformed to resolve against. The first URL is still worth
    // sending, and its failure reports the real problem better than this would.
  }
  return urls
}

export interface TranscribeOptions {
  baseUrl: string
  model: string
  /** Mono 16 kHz WAV. Anything the server's decoder accepts works, but this is what it is given. */
  audio: Blob
  /**
   * Seconds added to every timing.
   *
   * A track is transcribed in chunks, and each chunk's timings come back
   * relative to its own start. This is what puts them back where they belong.
   */
  offset?: number
  /**
   * Pinned rather than detected. It is always Mandarin, and auto-detection on a
   * chunk that happens to open with music is a whole chunk transcribed as the
   * wrong language.
   */
  language?: string
  signal?: AbortSignal
  /** Injectable so tests never touch the network. */
  fetchImpl?: typeof fetch
  /** Injectable so tests never touch IndexedDB. Defaults to doing nothing. */
  log?: LlmLogger
}

async function post(opts: TranscribeOptions, format: string, requestId: string): Promise<string> {
  const base = normalizeBaseUrl(opts.baseUrl)
  const fetchImpl = opts.fetchImpl ?? fetch
  const log = opts.log ?? noLog

  const form = new FormData()
  // The filename matters more than it should: servers that shell out to a
  // decoder pick the container from the extension, and an unnamed blob arrives
  // as `blob` with no extension at all.
  form.append('file', opts.audio, 'audio.wav')
  form.append('model', opts.model)
  form.append('response_format', format)
  form.append('language', opts.language ?? 'zh')
  // Greedy: this is transcription, not writing, and a sampled decode invents
  // plausible-sounding words where the audio is unclear.
  form.append('temperature', '0')

  const urls = endpointsFor(base)

  for (const url of urls) {
    log({
      level: 'debug',
      kind: 'transcribe',
      requestId,
      model: opts.model,
      message: `Sending ${(opts.audio.size / 1e6).toFixed(1)}MB to ${url} as ${format}`,
    })

    let res: Response
    try {
      res = await fetchImpl(url, { method: 'POST', body: form, signal: opts.signal })
    } catch (e) {
      const error = connectionError(base, e)
      log({
        level: 'error',
        kind: 'transcribe',
        requestId,
        model: opts.model,
        message: error.message,
        detail: String(e),
      })
      throw error
    }

    if (res.ok) return res.text()

    const body = await failureBody(res)

    // Only a 404 means "wrong path, try the other one". Every other status is
    // the server refusing the work itself — an unloaded model, audio it cannot
    // decode — and retrying that elsewhere would bury the reason it gave.
    if (res.status === 404 && url !== urls[urls.length - 1]) {
      log({
        level: 'debug',
        kind: 'transcribe',
        requestId,
        model: opts.model,
        status: res.status,
        message: `No transcription endpoint at ${url} — trying the next`,
      })
      continue
    }

    // Named for what it is when the last path 404s too: not a failed
    // transcription but a server that does not do transcription at this address.
    const message =
      res.status === 404
        ? `No transcription endpoint at ${base} — tried ${urls.join(' and ')}`
        : `Transcription failed: ${res.status} ${res.statusText}`

    log({
      level: 'error',
      kind: 'transcribe',
      requestId,
      model: opts.model,
      status: res.status,
      message,
      // A model that is not loaded is the usual cause, and the server says so.
      detail: body,
    })
    throw new LlmError(message, { status: res.status, body })
  }

  // Unreachable: the loop returns or throws on every path, and `endpointsFor`
  // never returns an empty list.
  throw connectionError(base, new Error('no endpoint tried'))
}

/**
 * One piece of audio, transcribed into cues.
 *
 * Falls back through `FORMATS` rather than trusting the first reply: a server
 * that does not implement `verbose_json` answers 200 with a body that has no
 * timings in it, which is a success as far as HTTP is concerned and useless as
 * far as this is. `null` from the parser — meaning "this shape has no timings" —
 * is what distinguishes that from genuinely silent audio, which parses fine and
 * yields nothing.
 */
export async function transcribe(opts: TranscribeOptions): Promise<Cue[]> {
  const requestId = newRequestId()
  const log = opts.log ?? noLog
  const started = Date.now()

  for (const format of FORMATS) {
    const body = await post(opts, format, requestId)
    const cues = parseTranscription(body)

    if (cues) {
      const offset = opts.offset ?? 0
      const shifted = shiftBy(cues, offset)
      log({
        level: 'info',
        kind: 'transcribe',
        requestId,
        model: opts.model,
        durationMs: Date.now() - started,
        message: `${shifted.length} line${shifted.length === 1 ? '' : 's'} from ${format}`,
        // With the timings, not just the words. A line that sits on screen over
        // the wrong dialogue is a fault in where it claims to be, and the text
        // alone cannot show it — nor tell a line that claimed a minute of the
        // track from a run of them all claiming the same words.
        detail: describeSegments(body, offset) ?? shifted.map(describeCue).join('\n'),
      })
      return shifted
    }

    log({
      level: 'warn',
      kind: 'transcribe',
      requestId,
      model: opts.model,
      message: `No timings in the ${format} reply — trying the next format`,
      detail: body.slice(0, 2000),
    })
  }

  return []
}

/** Moves every cue along the track, for a chunk that did not start at zero. */
export function shiftBy(cues: Cue[], offset: number): Cue[] {
  if (!offset) return cues
  return cues.map((cue) => ({ ...cue, start: cue.start + offset, end: cue.end + offset }))
}

/**
 * How many times over a line may be said back to back and still be speech.
 *
 * Two, because two is dialogue: one episode of 家有儿女 has 我有一点走不动的 twice
 * in a row and 你从美国都回来一百八十天了 twice in a row, both of them real.
 */
export const MOST_REPEATS = 2

/**
 * And how long such a run may last, which is the half that matters.
 *
 * Count alone cannot tell a loop from speech — 不不不 is three lines and is
 * someone talking. What separates them is that nobody keeps it up: a genuine
 * repetition is short and quick, and this is long enough to hold the ones that
 * are. Note that the two rules together need no separate check on how long the
 * *line* is, which was the other way of drawing this: three copies of a
 * nine-character sentence inside five seconds would be over five characters a
 * second, faster than Mandarin is spoken, so a line long enough to loop on is
 * one this catches anyway.
 */
export const LONGEST_REPEAT_S = 5

/**
 * A line Whisper got stuck on, reduced to the one that started it.
 *
 * Whisper repeats itself over music, and since `f6ac4aa` the default path has no
 * voice-activity detection to hide the music from it — the alignment `--dtw`
 * bought could not be mapped back through the VAD table, so the two cannot both
 * be on. What comes back over a theme tune is the last real line before it, over
 * and over: six copies of 我们是一个重组家庭 across twelve seconds, each with its
 * own timestamps, sitting on screen over the dialogue that follows.
 *
 * Nothing else in the pipeline can see it. `mergeCues` deduplicates on `start`,
 * which is a cue's identity everywhere downstream, and every repeat has a
 * different one. Neither can the server: whisper.cpp discards a window only when
 * it is both sure of the silence and unsure of the words (src/whisper.cpp:7622),
 * and this fails the second half — measured over the real thing, the loop's
 * `avg_logprob` ran -0.11 to -0.42 against -0.00 to -0.61 for genuine dialogue
 * in the same episode, and `no_speech_prob` was 0.00 for every segment of both.
 * The repetition is the only signal there is, so it is the one used.
 *
 * The line that started the run is kept rather than the whole run dropped: a
 * loop sometimes latches onto something real, and losing the echoes costs less
 * than losing the line.
 */
export function collapseLoops(
  cues: Cue[],
  repeats = MOST_REPEATS,
  longest = LONGEST_REPEAT_S,
): Cue[] {
  const kept: Cue[] = []

  for (let at = 0; at < cues.length;) {
    let past = at + 1
    while (past < cues.length && cues[past].text === cues[at].text) past++

    const looped = past - at > repeats && cues[past - 1].end - cues[at].start > longest
    kept.push(...(looped ? [cues[at]] : cues.slice(at, past)))
    at = past
  }

  return kept
}

/**
 * Cues from whatever the server sent back, or null if it carried no timings.
 *
 * Null and empty mean different things and the caller acts on the difference:
 * empty is a silent chunk, null is a server whose reply cannot be used at all.
 *
 * The loop check sits here rather than in either parser because a server that
 * cannot answer `verbose_json` gets stuck on a line just the same, and rather
 * than on the display side because this is not presentation: a transcript cache
 * has no business storing twelve seconds of a line nobody said.
 */
export function parseTranscription(body: string): Cue[] | null {
  const trimmed = body.trim()
  if (!trimmed) return null

  const cues =
    trimmed.startsWith('{') || trimmed.startsWith('[')
      ? parseVerboseJson(trimmed)
      : parseTimedText(trimmed)

  return cues && collapseLoops(cues)
}

interface VerboseWord {
  /** Centiseconds, and -1 when the server was not asked to align anything. */
  t_dtw?: unknown
}

interface VerboseSegment {
  start?: unknown
  end?: unknown
  text?: unknown
  words?: unknown
  /**
   * How sure the model was that the window held no speech at all, and how sure
   * it was of the words it wrote down anyway.
   *
   * Both are in every whisper.cpp reply and neither is read into a cue. They are
   * logged because they are the only thing that distinguishes a bad
   * transcription from a stretch with nothing to transcribe: whisper.cpp
   * discards a window only when it is *both* sure of the silence and unsure of
   * the words (src/whisper.cpp:7622), and a confident invention over a music bed
   * fails the second half of that test and is handed to us as dialogue.
   */
  no_speech_prob?: unknown
  avg_logprob?: unknown
}

/**
 * The shortest a line may be, for one whose end arrives before its real start.
 *
 * That is not a corruption but the ordinary case for a line in the middle of a
 * split segment: its end is the *next* line's guessed start, which the alignment
 * has just moved. `holdTail` will stretch it to meet its neighbour anyway.
 */
const MIN_LINE_S = 0.6

/**
 * When the line was actually spoken, if the server aligned it to the audio.
 *
 * A Whisper segment timestamp is not a measurement: segments tile a decode
 * window contiguously, so a line's start is wherever the previous line stopped
 * and a ten-second silence is spent showing the next line early. `--dtw` gets
 * the real answer out of the decoder's cross-attention, at 20ms resolution, and
 * the server hands it back on each word.
 *
 * Null unless it is there. `t_dtw` is -1 when nothing was aligned, and a server
 * that is not whisper.cpp has no `words` at all; both mean the segment's own
 * timings are the best available and are read exactly as they were before.
 */
function alignedStart(segment: VerboseSegment): number | null {
  if (!Array.isArray(segment.words)) return null

  for (const word of segment.words as VerboseWord[]) {
    const dtw = Number(word?.t_dtw)
    // The first *usable* one rather than the first: an unaligned token at the
    // head of a line would otherwise throw away the whole line's alignment.
    if (Number.isFinite(dtw) && dtw >= 0) return dtw / 100
  }
  return null
}

function parseVerboseJson(body: string): Cue[] | null {
  let payload: { segments?: unknown }
  try {
    payload = JSON.parse(body) as { segments?: unknown }
  } catch {
    return null
  }

  // A reply carrying only `text` is the plain `json` format: the transcription
  // is all there, and every timing has been thrown away. Unusable, not empty.
  if (!Array.isArray(payload.segments)) return null

  const cues = (payload.segments as VerboseSegment[])
    .map((segment) => {
      const aligned = alignedStart(segment)
      const start = aligned ?? Number(segment.start)
      const end = Number(segment.end)
      return cueFrom(
        start,
        aligned !== null && !(end > start) ? start + MIN_LINE_S : end,
        String(segment.text ?? ''),
      )
    })
    .filter((cue): cue is Cue => cue !== null)

  // Sorted because alignment can reorder what the tiling had in order, and
  // everything downstream — `findActiveCueIndex`'s binary search, `mergeCues`,
  // the chunk merge — takes sorted cues as given.
  return cues.sort((a, b) => a.start - b.start)
}

/** Seconds, to the hundredth, right-aligned so a column of them reads as one. */
function stamp(seconds: number): string {
  return seconds.toFixed(2).padStart(8)
}

/** One cue as a line of log: what it says, and where it claims to say it. */
function describeCue(cue: Cue): string {
  return `${stamp(cue.start)} →${stamp(cue.end)}   ${cue.text}`
}

/**
 * The reply as one line per segment, in track time.
 *
 * The cues alone cannot answer the question a stale caption asks. One line
 * claiming a minute of the track and forty lines each claiming the same words
 * look identical on screen and are different faults, and neither shape says why
 * it happened — which is what `no_speech_prob` and `avg_logprob` are for. So
 * this reports the segment as it arrived, next to the start the alignment moved
 * it to, rather than only the cue that came out.
 *
 * Track times rather than chunk-relative ones, because the reason to read this
 * is to hold it against what was on screen at the time. Null for a reply with no
 * segments in it, which the caller then describes by its cues instead.
 */
export function describeSegments(body: string, offset = 0): string | null {
  let payload: { segments?: unknown }
  try {
    payload = JSON.parse(body) as { segments?: unknown }
  } catch {
    return null
  }
  if (!Array.isArray(payload.segments)) return null

  return (payload.segments as VerboseSegment[])
    .map((segment) => {
      const aligned = alignedStart(segment)
      const parts = [
        `${stamp(Number(segment.start) + offset)} →${stamp(Number(segment.end) + offset)}`,
        // Only when there is one, so a reply without alignment is not a column
        // of dashes, and only the number — the arrow above already said seconds.
        aligned === null ? '        ' : `↦${stamp(aligned + offset)}`,
        `ns ${number(segment.no_speech_prob)}`,
        `lp ${number(segment.avg_logprob)}`,
        String(segment.text ?? '').trim(),
      ]
      return parts.join(' ')
    })
    .join('\n')
}

/** A number the server may not have sent, as a fixed-width field. */
function number(value: unknown): string {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed.toFixed(2).padStart(5) : '    ?'
}

/**
 * SRT and WebVTT, which differ for this purpose only in the decimal separator
 * and a header line — so one parser reads both rather than two reading one each.
 */
function parseTimedText(body: string): Cue[] | null {
  const cues: Cue[] = []
  const lines = body.split(/\r?\n/)
  let sawTiming = false

  for (let at = 0; at < lines.length; at++) {
    const timing =
      /(\d{1,2}:\d{2}(?::\d{2})?[.,]\d{1,3})\s*-->\s*(\d{1,2}:\d{2}(?::\d{2})?[.,]\d{1,3})/.exec(
        lines[at],
      )
    if (!timing) continue
    sawTiming = true

    // Everything up to the next blank line is this cue's text. Subtitles wrap
    // across lines, and joining without a separator is right for Chinese.
    const text: string[] = []
    while (++at < lines.length && lines[at].trim()) text.push(lines[at].trim())

    const cue = cueFrom(parseTimestamp(timing[1]), parseTimestamp(timing[2]), text.join(''))
    if (cue) cues.push(cue)
  }

  return sawTiming ? cues : null
}

/** `HH:MM:SS,mmm`, `MM:SS.mmm` and the variants in between, as seconds. */
export function parseTimestamp(stamp: string): number {
  const [clock, fraction] = stamp.replace(',', '.').split('.')
  const parts = clock.split(':').map(Number)
  const seconds = parts.reduce((total, part) => total * 60 + part, 0)
  return seconds + Number(`0.${fraction ?? 0}`)
}

/**
 * One cue, or null where there is nothing worth showing.
 *
 * Blank text is dropped because Whisper emits empty segments over silence, and
 * a cue whose end does not follow its start can never be matched against a
 * playhead — the same rule `normalizeCue` applies to Bilibili's own tracks.
 */
function cueFrom(start: number, end: number, text: string): Cue | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  if (!Number.isFinite(start) || !Number.isFinite(end) || !(end > start)) return null
  return { start, end, text: trimmed }
}
