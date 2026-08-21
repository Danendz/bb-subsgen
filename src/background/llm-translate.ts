// The background translation pass.
//
// Lives in the worker for a reason that is not negotiable: a content script
// runs on Bilibili's origin, so its fetches are subject to CORS and Chrome's
// private-network rules block a public page from reaching localhost outright.
// The worker holds host permission and neither applies. It also outlives the
// tab's own bookkeeping, owns the cache, and is the one place that can see that
// a chat is generating and get out of its way.
//
// One pass at a time, globally. There is one GPU behind all of this, and two
// passes racing on it finish later than the same two run in order.

import {
  batchSystem,
  batchUser,
  BATCH_SCHEMA,
  pickBatch,
  planBatches,
  reconcile,
  SEAM_LINES,
  type BatchLine,
  type VideoPreamble,
} from '../llm/batch'
import { chatCompletion } from '../llm/client'
import { translationGlossary } from '../llm/glossary'
import { log } from '../llm/log'
import { extractJson } from '../llm/reply'
import { newRequestId } from '../llm/types'
import { parseVideoIdFromUrl } from '../bilibili/resolve'
import type { TranslationLang } from '../shared/settings'
import { lookupDefs } from '../dict/store'
import { evict, readTrack, writeLines } from './llm-cache'

/** A cue as the pass needs it: what to translate, and how to key what comes back. */
export interface PassCue {
  start: number
  text: string
  /** Segmented by the content script, which already holds the lexicon. */
  words: string[]
}

export interface PassRequest {
  tabId: number
  videoId: string
  lang: TranslationLang
  model: string
  baseUrl: string
  video?: VideoPreamble
  cues: PassCue[]
}

/**
 * What the content script is told, as each batch lands.
 *
 * Addressed by cue start rather than by index. The pass numbers its own copy of
 * the track, and on a transcribed video the content script's copy grows
 * underneath it as chunks land — so an index answered against one numbering
 * would be painted onto another. Start is what the cache is keyed by anyway.
 */
export interface PassResult {
  videoId: string
  lang: TranslationLang
  lines: Array<{ start: number; text: string }>
}

interface Pass {
  request: PassRequest
  abort: AbortController
  /** Re-read every iteration, so seeking re-orders what is left. */
  playhead: number
  /** Lines that have a translation, the ones that came from cache included. */
  translated: number
  /** Lines that will ever have one — blank cues are never sent. */
  total: number
}

/** What the popup's progress bar reads. See `passStatus`. */
export interface PassStatus {
  videoId: string
  model: string
  translated: number
  total: number
}

/**
 * How far the pass for `tabId` has got, or null if it has none running.
 *
 * A query rather than a broadcast because the popup is short-lived and the pass
 * is not: a popup opened halfway through has to fill its bar straight away, and
 * a listener would leave it blank until the next batch landed — up to a minute
 * of looking broken.
 */
export function passStatus(tabId: number): PassStatus | null {
  if (!active || active.request.tabId !== tabId) return null
  return {
    videoId: active.request.videoId,
    model: active.request.model,
    translated: active.translated,
    total: active.total,
  }
}

let active: Pass | null = null

/**
 * Whether a chat is generating right now.
 *
 * One GPU: a 25-line batch in flight is fifteen seconds an explanation you
 * asked for spends waiting. The pass stops handing out new work while a chat is
 * running, and picks up where it left off after.
 */
let chatBusy = false

export function setChatBusy(busy: boolean): void {
  chatBusy = busy
}

/** Ends the current pass, if any. Called on video change and on teardown. */
export function cancelPass(tabId?: number): void {
  if (!active) return
  if (tabId !== undefined && active.request.tabId !== tabId) return
  active.abort.abort()
  active = null
}

/**
 * Ends the pass for a tab that has navigated away from the video it was for.
 *
 * The gap this closes: a tab that navigates without closing destroys its
 * content script without giving it a chance to say so, and `tabs.onRemoved`
 * never fires because the tab is still there. Nothing else notices — `send`
 * treats a vanished tab as unremarkable, by design — so the pass carried on
 * translating a video nobody had open, for as long as the track lasted.
 *
 * Deliberately conditional on the videoId rather than cancelling on any URL
 * change. A timestamp link or a query parameter is still the same video, and
 * cancelling on those would race the content script, which starts its own pass
 * on SPA navigation: the worker could cancel the new pass a moment after it
 * began, on the strength of a URL change that had already been handled.
 */
export function cancelPassIfNavigatedAway(tabId: number, url: string): void {
  if (!active || active.request.tabId !== tabId) return
  if (parseVideoIdFromUrl(url) === active.request.videoId) return
  cancelPass(tabId)
}

/**
 * Ends a tab's pass when the page that asked for it goes away.
 *
 * The port exists only to be dropped. Whatever destroys the page — following a
 * link off the site, typing a new address, a reload, a crash — takes the port
 * with it, and none of that requires a permission to observe. That matters:
 * `cancelPassIfNavigatedAway` can only see URLs the extension holds host
 * permission for, so a tab leaving Bilibili altogether is invisible to it, and
 * that is the most ordinary way there is to change the page.
 *
 * A side effect worth naming: an open port keeps the service worker alive. The
 * content script therefore holds one only while a pass is running, which is
 * exactly when the worker needs to be alive anyway.
 */
export function watchTabLiveness(port: chrome.runtime.Port): void {
  const tabId = port.sender?.tab?.id
  if (tabId === undefined) return // the app page or the drawer, which own no pass
  port.onDisconnect.addListener(() => cancelPass(tabId))
}

export function reportPlayhead(tabId: number, index: number): void {
  if (active?.request.tabId === tabId) active.playhead = index
}

function send(tabId: number, result: PassResult): void {
  // The tab may have gone; a translation nobody is waiting for is not an error.
  void chrome.tabs
    .sendMessage(tabId, { type: 'bb-subsgen:llm-translations', ...result })
    .catch(() => {})
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Waits out a chat, so an explanation never queues behind a batch. */
async function waitForGpu(signal: AbortSignal): Promise<void> {
  while (chatBusy && !signal.aborted) await sleep(250)
}

async function translateBatch(
  pass: Pass,
  batch: BatchLine[],
  seam: Array<{ zh: string; en: string }>,
): Promise<Map<number, string>> {
  const { request } = pass
  const requestId = newRequestId()

  // The words are already segmented; all this needs is what the dictionary
  // knows about the longer ones.
  const words = batch.flatMap((line) => request.cues[line.id]?.words ?? [])
  const defs = words.length ? await lookupDefs([...new Set(words)]) : {}
  const glossary = translationGlossary(words, defs)

  const prompt = {
    lines: batch,
    lang: request.lang,
    glossary,
    seam,
    ...(request.video ? { video: request.video } : {}),
  }

  const reply = await chatCompletion({
    baseUrl: request.baseUrl,
    model: request.model,
    messages: [
      { role: 'system', content: batchSystem(prompt) },
      { role: 'user', content: batchUser(prompt) },
    ],
    // Pinned: a retry that produces a different answer than the one being
    // retried is not a retry, and a cache entry should not depend on when it
    // was written.
    temperature: 0,
    responseFormat: BATCH_SCHEMA,
    signal: pass.abort.signal,
    log,
  })

  const { accepted, missing } = reconcile(batch, extractJson(reply.content))

  if (missing.length) {
    log({
      level: 'warn',
      kind: 'translate-batch',
      requestId,
      model: request.model,
      message: `${missing.length} of ${batch.length} lines came back wrong or not at all — retrying them`,
      detail: `missing ids: ${missing.join(', ')}\n\n${reply.content}`,
    })
  }

  return accepted
}

/**
 * One batch, then one retry of whatever it dropped.
 *
 * Only one retry. Models skip lines routinely, so this is the normal path and
 * not an error handler — but a line that has been asked for twice and not
 * answered twice is not going to come back on the third ask, and the on-device
 * translation is already on screen for it. Chasing it further spends the GPU on
 * the least valuable line in the video.
 */
async function translateWithRetry(
  pass: Pass,
  batch: BatchLine[],
  seam: Array<{ zh: string; en: string }>,
): Promise<Map<number, string>> {
  const accepted = await translateBatch(pass, batch, seam)

  const missing = batch.filter((line) => !accepted.has(line.id))
  if (!missing.length || pass.abort.signal.aborted) return accepted

  for (const [id, text] of await translateBatch(pass, missing, seam)) {
    accepted.set(id, text)
  }
  return accepted
}

/**
 * Translates a whole track in the background, nearest the playhead first.
 *
 * Cached lines are reported before anything is asked for, so a second viewing
 * is instant and costs nothing.
 */
export async function startPass(request: PassRequest): Promise<void> {
  // The same pass, asked for twice. Bilibili replaces the `<video>` element
  // during DASH and DRM setup, which remounts the overlay and re-sends this;
  // starting over would abandon the batch in flight and re-read the cache for
  // no gain. A duplicate request is a caller that mounted twice, not a caller
  // that wants this thrown away.
  //
  // The cue count is part of the comparison because a transcript grows as chunks
  // land: the same video with more lines in it is more work to do, not the same
  // work again.
  if (
    active &&
    active.request.tabId === request.tabId &&
    active.request.videoId === request.videoId &&
    active.request.lang === request.lang &&
    active.request.model === request.model &&
    active.request.cues.length === request.cues.length
  ) {
    return
  }

  cancelPass()

  const pass: Pass = {
    request,
    abort: new AbortController(),
    playhead: 0,
    translated: 0,
    total: request.cues.filter((cue) => cue.text.trim()).length,
  }
  active = pass
  const { signal } = pass.abort
  const requestId = newRequestId()

  const key = { videoId: request.videoId, lang: request.lang, model: request.model }
  const startToIndex = new Map(request.cues.map((cue, index) => [cue.start, index]))

  // Everything already known, in one go and before any generation.
  const cached = await readTrack(key)
  if (signal.aborted) return

  const done = new Map<number, string>()
  const fromCache: PassResult['lines'] = []
  for (const [start, text] of cached) {
    const index = startToIndex.get(start)
    if (index === undefined) continue
    done.set(index, text)
    fromCache.push({ start, text })
  }
  pass.translated = done.size
  if (fromCache.length) send(request.tabId, { ...key, lines: fromCache })

  const pending = planBatches(request.cues.map((cue) => cue.text)).filter((batch) =>
    batch.some((line) => !done.has(line.id)),
  )

  log({
    level: 'info',
    kind: 'translate-batch',
    requestId,
    model: request.model,
    message: `${request.videoId}: ${fromCache.length} lines cached, ${pending.length} batches to translate`,
  })

  while (pending.length && !signal.aborted) {
    await waitForGpu(signal)
    if (signal.aborted) return

    const at = pickBatch(pending, pass.playhead)
    if (at === null) break
    const [batch] = pending.splice(at, 1)

    // The tail of whatever immediately precedes this batch and is already
    // translated — which after a seek may be nothing, and that is fine.
    const seam: Array<{ zh: string; en: string }> = []
    for (let id = batch[0].id - 1; id >= 0 && seam.length < SEAM_LINES; id -= 1) {
      const en = done.get(id)
      if (!en) break
      seam.unshift({ zh: request.cues[id].text, en })
    }

    let accepted: Map<number, string>
    try {
      accepted = await translateWithRetry(pass, batch, seam)
    } catch (e) {
      if (signal.aborted) return
      // One failed batch must not kill the pass — the next one may well work,
      // and every line here already has an on-device translation on screen.
      log({
        level: 'error',
        kind: 'translate-batch',
        requestId,
        model: request.model,
        message: 'A batch failed; carrying on with the rest of the track',
        detail: String(e),
      })
      continue
    }

    if (signal.aborted) return
    if (!accepted.size) continue

    const lines: PassResult['lines'] = []
    for (const [index, text] of accepted) {
      done.set(index, text)
      lines.push({ start: request.cues[index].start, text })
    }
    // `done` rather than a running total: a retry can re-answer a line already
    // accepted, and counting the batch would drift past the real figure.
    pass.translated = done.size

    await writeLines(key, lines)
    send(request.tabId, { ...key, lines })
  }

  if (signal.aborted) return
  active = null

  log({
    level: 'info',
    kind: 'translate-batch',
    requestId,
    model: request.model,
    message: `${request.videoId}: finished with ${done.size} of ${request.cues.length} lines translated`,
  })

  // Only once the pass is done: evicting mid-pass could drop the track being
  // written to.
  const dropped = await evict()
  if (dropped) {
    log({
      level: 'info',
      kind: 'translate-batch',
      requestId,
      message: `Dropped ${dropped} cached video${dropped === 1 ? '' : 's'} to stay under the cap`,
    })
  }
}
