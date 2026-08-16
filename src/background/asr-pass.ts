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
import { OFFSCREEN_TARGET, isTranscribeDone, isTranscribeProgress } from '../offscreen/protocol'
import type { Cue } from '../bilibili/subtitles'
import type { AsrCuesMessage } from '../shared/messages'

export interface TranscribeStart {
  videoId: string
  cid: number
  model: string
  baseUrl: string
  playhead: number
}

interface ActiveRun {
  tabId: number
  videoId: string
  model: string
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

async function readActive(): Promise<ActiveRun | null> {
  const stored = await chrome.storage.session.get(ACTIVE_KEY)
  return (stored[ACTIVE_KEY] as ActiveRun | undefined) ?? null
}

async function writeActive(run: ActiveRun | null): Promise<void> {
  if (run) await chrome.storage.session.set({ [ACTIVE_KEY]: run })
  else await chrome.storage.session.remove(ACTIVE_KEY)
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
    send(tabId, { videoId, cues: cached, done: 1, total: 1, complete: true })
    return
  }

  // Whatever was running was for a video nobody is watching any more.
  await cancelTranscription()
  await writeActive({ tabId, videoId, model })

  try {
    await ensureOffscreen()
  } catch (e) {
    await writeActive(null)
    send(tabId, {
      videoId,
      cues: [],
      done: 0,
      total: 0,
      complete: true,
      error: 'Could not start the audio decoder.',
    })
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
    })
    .catch(() => {})
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
  return false
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
  send(run.tabId, {
    videoId: msg.videoId,
    cues: msg.cues,
    done: msg.done,
    total: msg.total,
    covered: msg.covered,
    complete: false,
  })
}

async function routeDone(msg: {
  videoId: string
  cues: Cue[]
  error?: string
}): Promise<void> {
  const run = await readActive()
  if (run?.videoId !== msg.videoId) return
  await writeActive(null)
  await finish(run, msg.cues, msg.error)
}

async function finish(run: ActiveRun, cues: Cue[], error?: string): Promise<void> {
  // Only a complete run is stored. A half-written transcript is indistinguishable
  // from a whole one once it is in the cache, and serving one would give an
  // episode whose subtitles stop in the middle with no way to notice.
  if (!error && cues.length) {
    await writeTranscript({ videoId: run.videoId, model: run.model }, cues)
    await evictTranscripts()
  }

  send(run.tabId, {
    videoId: run.videoId,
    cues,
    done: 1,
    total: 1,
    complete: true,
    ...(error ? { error } : {}),
  })

  // The decoded track is the largest allocation this extension makes, and the
  // document has nothing else to do between videos.
  await closeOffscreen()
}
