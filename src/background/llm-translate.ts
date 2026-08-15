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
import type { TranslationLang } from '../shared/settings'
import { lookupDefs } from './defs-store'
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
  bvid: string
  lang: TranslationLang
  model: string
  baseUrl: string
  video?: VideoPreamble
  cues: PassCue[]
}

/** What the content script is told, as each batch lands. */
export interface PassResult {
  bvid: string
  lang: TranslationLang
  lines: Array<{ index: number; text: string }>
}

interface Pass {
  request: PassRequest
  abort: AbortController
  /** Re-read every iteration, so seeking re-orders what is left. */
  playhead: number
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
  cancelPass()

  const pass: Pass = { request, abort: new AbortController(), playhead: 0 }
  active = pass
  const { signal } = pass.abort
  const requestId = newRequestId()

  const key = { bvid: request.bvid, lang: request.lang, model: request.model }
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
    fromCache.push({ index, text })
  }
  if (fromCache.length) send(request.tabId, { ...key, lines: fromCache })

  const pending = planBatches(request.cues.map((cue) => cue.text)).filter((batch) =>
    batch.some((line) => !done.has(line.id)),
  )

  log({
    level: 'info',
    kind: 'translate-batch',
    requestId,
    model: request.model,
    message: `${request.bvid}: ${fromCache.length} lines cached, ${pending.length} batches to translate`,
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
      lines.push({ index, text })
    }

    await writeLines(
      key,
      lines.map((line) => ({ start: request.cues[line.index].start, text: line.text })),
    )
    send(request.tabId, { ...key, lines })
  }

  if (signal.aborted) return
  active = null

  log({
    level: 'info',
    kind: 'translate-batch',
    requestId,
    model: request.model,
    message: `${request.bvid}: finished with ${done.size} of ${request.cues.length} lines translated`,
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
