// The transcription run, coordinated from the worker.
//
// The worker sits in the middle for three reasons, none of them optional:
// a content script may not create an offscreen document, it cannot reach a
// server on localhost (see llm/client.ts), and it has no access to the cache
// that usually makes the whole request unnecessary.
//
// One run at a time, globally — the same rule the translation pass follows, and
// for the same reason. There is one GPU behind all of this, and a transcription
// racing a translation finishes later than the two run in order.

import { evictTranscripts, readTranscript, writeTranscript } from './transcript-cache'
import { closeOffscreen, ensureOffscreen } from './offscreen'
import { log } from '../llm/log'
import {
  OFFSCREEN_TARGET,
  isAudioNeeded,
  isTranscribeDone,
  isTranscribeProgress,
  type AudioNeeded,
  type TranscribeDone,
} from '../offscreen/protocol'
import type { AudioSource } from '../media/audio-source'
import type { Cue } from '../media/cue'
import type { AsrCuesMessage } from '../shared/messages'

export interface TranscribeStart {
  videoId: string
  /** Already located by the content script, which is the half that knows the site. */
  audio: AudioSource
  model: string
  baseUrl: string
  playhead: number
}

interface ActiveRun {
  tabId: number
  videoId: string
  model: string
  /**
   * Kept so `retryTranscription` can re-issue without the tab's help.
   *
   * Which the popup's Retry button needs and the overlay's does not: the overlay
   * re-resolves the audio and starts afresh, because a URL can carry a deadline
   * and the page is right there to ask for a new one. The popup has no page, so
   * it replays this — good enough, since a retry follows a failure by seconds.
   */
  audio: AudioSource
  baseUrl: string
  /** Chunks finished and chunks planned, for the popup to report. */
  done: number
  total: number
}

/**
 * What a run that ended with gaps left behind.
 *
 * Its whole purpose is that a retry redoes only what failed. Everything needed
 * to re-issue the request is here, because by the time somebody presses Retry
 * the page may have been reloaded and the worker restarted twice over.
 *
 * Session storage, like the active run, and for a stronger reason: this is the
 * only copy. Nothing partial is written to IndexedDB — `writeTranscriptIn`
 * refuses it, because a half-written transcript is indistinguishable from a
 * whole one once it is in the store and would silently serve an episode whose
 * subtitles stop in the middle.
 */
interface LastRun extends ActiveRun {
  cues: Cue[]
  /** Stretches that could not be transcribed. Never empty — see `writeLast`. */
  failed: Array<[number, number]>
  error: string
}

/**
 * Where the run is remembered, and deliberately not a variable.
 *
 * A worker holds nothing across its own termination, and Chrome terminates one
 * that has been idle for thirty seconds. Transcription is the worst possible
 * shape for that: minutes pass in which this worker does nothing whatsoever —
 * the audio is fetched, decoded and posted from the offscreen document, which
 * has its own lifetime — and then a progress message arrives at a worker started
 * fresh to receive it. In memory, `active` would be null and every chunk after
 * the first would be dropped on the floor, transcript included.
 *
 * The translation pass survives on a plain variable only because it is never
 * quiet for that long: a batch lands every few seconds and each one resets the
 * timer. Nothing here does.
 *
 * `chrome.storage.session` is memory-backed and cleared when the browser closes,
 * so this costs no disk and cannot outlive the browsing session — which is
 * exactly the lifetime a run in progress should have.
 */
const ACTIVE_KEY = 'asr:active'
const LAST_KEY = 'asr:last'

async function readActive(): Promise<ActiveRun | null> {
  const stored = await chrome.storage.session.get(ACTIVE_KEY)
  return (stored[ACTIVE_KEY] as ActiveRun | undefined) ?? null
}

async function writeActive(run: ActiveRun | null): Promise<void> {
  if (run) await chrome.storage.session.set({ [ACTIVE_KEY]: run })
  else await chrome.storage.session.remove(ACTIVE_KEY)
}

async function readLast(): Promise<LastRun | null> {
  const stored = await chrome.storage.session.get(LAST_KEY)
  return (stored[LAST_KEY] as LastRun | undefined) ?? null
}

/**
 * Kept only while there is something to retry; a clean run clears it.
 *
 * Keyed on the error rather than on `failed`, so that a run which fell over
 * before it had any chunks to fail — no audio stream, no decoder — is still
 * something the Retry button can act on. It just has nothing to resume from, so
 * `startTranscription` starts it over.
 */
async function writeLast(run: LastRun | null): Promise<void> {
  if (run?.error) await chrome.storage.session.set({ [LAST_KEY]: run })
  else await chrome.storage.session.remove(LAST_KEY)
}

function send(tabId: number, message: Omit<AsrCuesMessage, 'type'>): void {
  // The tab may have gone; a transcript nobody is waiting for is not an error.
  void chrome.tabs.sendMessage(tabId, { type: 'bb-subsgen:asr-cues', ...message }).catch(() => {})
}

/**
 * Transcribes a video, or hands back the transcript already stored for it.
 *
 * The cache is checked before anything is started, which is the path taken on
 * every rewatch, every reload and every seek back to a video watched before —
 * and the reason the GPU cost of this feature is paid once per episode rather
 * than once per viewing.
 */
export async function startTranscription(tabId: number, request: TranscribeStart): Promise<void> {
  const { videoId, model } = request

  // The same run, asked for twice. Starting over would cancel what is already
  // happening — closing the offscreen document mid-request, which the speech
  // server sees as the client hanging up — and then repeat a download, a decode
  // and however many chunks had already been transcribed. A duplicate request is
  // a caller that mounted twice, not a caller that wants this thrown away.
  const running = await readActive()
  if (
    running &&
    running.videoId === videoId &&
    running.model === model &&
    running.tabId === tabId
  ) {
    log({
      level: 'debug',
      kind: 'transcribe',
      requestId: videoId,
      model,
      message: 'Already transcribing this video — leaving the run alone',
    })
    return
  }

  const cached = await readTranscript({ videoId, model })
  if (cached.length) {
    log({
      level: 'info',
      kind: 'transcribe',
      requestId: videoId,
      model,
      message: `${cached.length} lines from cache — nothing to transcribe`,
    })
    await writeLast(null)
    send(tabId, { videoId, cues: cached, done: 1, total: 1, complete: true })
    return
  }

  /**
   * Where a previous run gave up, if it was this video and this model.
   *
   * Checked on every start rather than only on an explicit retry, so that
   * pressing Retry, reloading the page and coming back to the tab are one path
   * rather than three. A reload after a failure resuming instead of starting
   * over is the point: the work is still held, and throwing it away because the
   * page was refreshed would be gratuitous.
   */
  const last = await readLast()
  const resume =
    last && last.videoId === videoId && last.model === model && last.failed.length ? last : null
  if (resume) {
    log({
      level: 'info',
      kind: 'transcribe',
      requestId: videoId,
      model,
      message:
        `Resuming: ${resume.cues.length} lines already in hand, ` +
        `${resume.failed.length} stretch${resume.failed.length === 1 ? '' : 'es'} to redo`,
    })
  }

  // Whatever was running was for a video nobody is watching any more.
  await cancelTranscription()
  const run: ActiveRun = {
    tabId,
    videoId,
    model,
    audio: request.audio,
    baseUrl: request.baseUrl,
    done: 0,
    total: resume?.failed.length ?? 0,
  }
  await writeActive(run)

  try {
    await ensureOffscreen()
  } catch (e) {
    const error = 'Could not start the audio decoder.'
    await writeActive(null)
    await writeLast({ ...run, cues: [], failed: [], error })
    send(tabId, { videoId, cues: [], done: 0, total: 0, complete: true, error })
    log({
      level: 'error',
      kind: 'transcribe',
      requestId: videoId,
      model,
      message: 'Could not create the offscreen document',
      detail: String(e),
    })
    return
  }

  void chrome.runtime
    .sendMessage({
      type: 'bb-subsgen:offscreen-transcribe',
      target: OFFSCREEN_TARGET,
      ...request,
      ...(resume ? { seed: resume.cues, only: resume.failed } : {}),
    })
    .catch(() => {})
}

/**
 * Asks again for the stretches a run could not transcribe.
 *
 * Nothing more than an ordinary start: `startTranscription` finds the same
 * leftovers and seeds from them, so there is one path in and not a second one
 * that has to be kept in step with it.
 *
 * For the popup, which has no page of its own to ask. The overlay's Retry does
 * not come through here — it re-resolves the audio and calls the ordinary start,
 * which is the same path with a fresher URL. See `ActiveRun.audio`.
 */
export async function retryTranscription(tabId: number): Promise<void> {
  const last = await readLast()
  if (!last || last.tabId !== tabId) return

  await startTranscription(tabId, {
    videoId: last.videoId,
    audio: last.audio,
    model: last.model,
    baseUrl: last.baseUrl,
    // Irrelevant on a resume: the stretches to do are given, not planned.
    playhead: 0,
  })
}

/** What the popup and the overlay report about this tab's transcription. */
export interface TranscriptStatus {
  videoId: string
  model: string
  /** Chunks finished, and chunks this run set out to do. */
  done: number
  total: number
  /** Stretches that could not be transcribed. Zero while a run is going. */
  failed: number
  /** Why it stopped, when it did. */
  error?: string
  running: boolean
}

/**
 * How this tab's transcription is doing, or null if it has nothing to say.
 *
 * A query rather than a broadcast, for the reason `passStatus` gives: the popup
 * is short-lived and a run is not, so one opened halfway through has to fill in
 * straight away. Unlike `passStatus` this has to be awaited, because the run
 * lives in session storage rather than in a variable — a worker that has been
 * shut down and restarted still answers correctly, which is the whole point.
 */
export async function transcriptStatus(tabId: number): Promise<TranscriptStatus | null> {
  const running = await readActive()
  if (running?.tabId === tabId) {
    return {
      videoId: running.videoId,
      model: running.model,
      done: running.done,
      total: running.total,
      failed: 0,
      running: true,
    }
  }

  const last = await readLast()
  if (last?.tabId === tabId) {
    return {
      videoId: last.videoId,
      model: last.model,
      done: last.done,
      total: last.total,
      failed: last.failed.length,
      error: last.error,
      running: false,
    }
  }

  return null
}

/**
 * Ties a run's life to the tab that asked for it.
 *
 * The job `watchTabLiveness` does for the pass: navigating away destroys the
 * content script without giving it a chance to cancel, and the port going with
 * the page is what stops a transcript nobody will read.
 *
 * Keeping the worker alive is a welcome side effect and nothing is built on it.
 * The run's state lives in `chrome.storage.session` precisely so that whether
 * the worker survives is not something this has to be right about.
 */
export function watchAsrTab(port: chrome.runtime.Port): void {
  const tabId = port.sender?.tab?.id
  if (tabId === undefined) return
  port.onDisconnect.addListener(() => void cancelTranscription(tabId))
}

/**
 * Passes a seek on to the run, so it re-orders what is left around it.
 *
 * Routed through here rather than sent to the offscreen document directly —
 * which a content script could do, since they share one message bus — because
 * this is the only place that knows whose run is active. Without the check, a
 * seek in one tab would re-order another tab's transcription.
 */
export async function reportAsrPlayhead(tabId: number, seconds: number): Promise<void> {
  const running = await readActive()
  if (running?.tabId !== tabId) return

  void chrome.runtime
    .sendMessage({
      type: 'bb-subsgen:offscreen-playhead',
      target: OFFSCREEN_TARGET,
      seconds,
    })
    .catch(() => {})
}

/** Ends the current run. Called on video change, on teardown and before a new one. */
export async function cancelTranscription(tabId?: number): Promise<void> {
  const running = await readActive()
  if (!running) return
  if (tabId !== undefined && running.tabId !== tabId) return

  await writeActive(null)
  void chrome.runtime
    .sendMessage({ type: 'bb-subsgen:offscreen-cancel', target: OFFSCREEN_TARGET })
    .catch(() => {})
  await closeOffscreen()
}

/**
 * Routes what the offscreen document reports back to the tab that asked.
 *
 * Returns whether the message was one of ours, so the worker's single listener
 * can tell it apart from everything else on the same bus.
 */
export function handleOffscreenEvent(msg: unknown): boolean {
  // Claimed synchronously, routed asynchronously. The worker's listener needs
  // its answer now — a promise here would be read as "no reply is coming" and
  // the message would fall through to handlers that cannot read it — while
  // finding out who asked is a read from storage.
  if (isTranscribeProgress(msg)) {
    void routeProgress(msg)
    return true
  }
  if (isTranscribeDone(msg)) {
    void routeDone(msg)
    return true
  }
  if (isAudioNeeded(msg)) {
    void routeAudioNeeded(msg)
    return true
  }
  return false
}

/**
 * Points the offscreen document's request for audio at the tab that asked.
 *
 * The worker is in this exchange only because it is the one place that knows
 * whose run is active — the same reason `reportAsrPlayhead` exists. The bytes
 * come back the short way, straight from the content script to the offscreen
 * document, and never pass through here.
 */
async function routeAudioNeeded(msg: AudioNeeded): Promise<void> {
  const run = await readActive()
  if (run?.videoId !== msg.videoId) return
  // A tab that has gone leaves the run waiting, which the next cancel clears.
  void chrome.tabs.sendMessage(run.tabId, msg).catch(() => {})
}

async function routeProgress(msg: {
  videoId: string
  cues: Cue[]
  done: number
  total: number
  covered: Array<[number, number]>
}): Promise<void> {
  const run = await readActive()
  // A run that has been superseded may still have a chunk in flight.
  if (run?.videoId !== msg.videoId) return
  // Recorded so the popup can report a run this worker did not itself start —
  // it may well have been shut down and restarted since it did.
  await writeActive({ ...run, done: msg.done, total: msg.total })
  send(run.tabId, {
    videoId: msg.videoId,
    cues: msg.cues,
    done: msg.done,
    total: msg.total,
    covered: msg.covered,
    complete: false,
  })
}

async function routeDone(msg: TranscribeDone): Promise<void> {
  const run = await readActive()
  if (run?.videoId !== msg.videoId) return
  await writeActive(null)
  await finish({ ...run, done: msg.done, total: msg.total }, msg)
}

async function finish(run: ActiveRun, msg: TranscribeDone): Promise<void> {
  const { cues, failed, error } = msg

  // Only a complete run is stored. A half-written transcript is indistinguishable
  // from a whole one once it is in the cache, and serving one would give an
  // episode whose subtitles stop in the middle with no way to notice.
  if (!error && cues.length) {
    await writeTranscript({ videoId: run.videoId, model: run.model }, cues)
    await evictTranscripts()
  }

  // What a retry works from. Kept in session storage rather than dropped,
  // because the alternative to redoing one failed stretch is redoing the fetch,
  // the decode and every chunk that was already correct.
  await writeLast({ ...run, cues, failed, error: error ?? '' })

  send(run.tabId, {
    videoId: run.videoId,
    cues,
    done: run.done,
    total: run.total,
    complete: true,
    ...(error ? { error } : {}),
  })

  // The decoded track is the largest allocation this extension makes, and the
  // document has nothing else to do between videos.
  await closeOffscreen()
}
