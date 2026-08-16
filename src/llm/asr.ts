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
import type { Cue } from '../bilibili/subtitles'

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

async function post(
  opts: TranscribeOptions,
  format: string,
  requestId: string,
): Promise<string> {
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
      const shifted = shiftBy(cues, opts.offset ?? 0)
      log({
        level: 'info',
        kind: 'transcribe',
        requestId,
        model: opts.model,
        durationMs: Date.now() - started,
        message: `${shifted.length} line${shifted.length === 1 ? '' : 's'} from ${format}`,
        detail: shifted.map((cue) => cue.text).join('\n'),
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
 * Cues from whatever the server sent back, or null if it carried no timings.
 *
 * Null and empty mean different things and the caller acts on the difference:
 * empty is a silent chunk, null is a server whose reply cannot be used at all.
 */
export function parseTranscription(body: string): Cue[] | null {
  const trimmed = body.trim()
  if (!trimmed) return null

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return parseVerboseJson(trimmed)
  }
  return parseTimedText(trimmed)
}

interface VerboseSegment {
  start?: unknown
  end?: unknown
  text?: unknown
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

  return (payload.segments as VerboseSegment[])
    .map((segment) =>
      cueFrom(Number(segment.start), Number(segment.end), String(segment.text ?? '')),
    )
    .filter((cue): cue is Cue => cue !== null)
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
    const timing = /(\d{1,2}:\d{2}(?::\d{2})?[.,]\d{1,3})\s*-->\s*(\d{1,2}:\d{2}(?::\d{2})?[.,]\d{1,3})/.exec(
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
