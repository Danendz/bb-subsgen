// Opening an explanation.
//
// One path, used by both surfaces: the Explain button on a review card, and the
// one on the hover card while watching (which reaches this through an iframe of
// this same page). Both end with a conversation in the database and a chat id
// to open, so neither has to know how a passage is rebuilt.
//
// The expensive parts — the subtitle track, the dictionary — are fetched here
// rather than stored at capture time. That costs a moment when the button is
// pressed and nothing at all until then, and it means this works on every word
// collected before any of this existed.

import { fetchVideoInfo } from '../../bilibili/resolve'
import { fetchSubtitles, type Cue } from '../../bilibili/subtitles'
import { createChat } from '../../chat/store'
import type { ChatContext } from '../../chat/types'
import { hanWords } from '../../flashcards/capture'
import { KNOWN_SET_KEY } from '../../flashcards/known'
import { loadWords } from '../../lang/dict'
import { segment } from '../../lang/segment'
import { lineWindow } from '../../llm/context'
import { splitByKnown } from '../../llm/glossary'
import { log } from '../../llm/log'
import { explainQuestion } from '../../llm/prompts'
import { newRequestId } from '../../llm/types'
import { lookupDefs } from '../../shared/dict-client'
import { loadSettings } from '../../shared/settings'

/**
 * Tracks already fetched this page load.
 *
 * Reviewing walks through several words from the same video in a row, and the
 * track is the slow part. Failures are not cached — a video that was
 * unreachable once should be tried again on the next card.
 */
const tracks = new Map<string, Promise<Cue[]>>()

export function trackFor(bvid: string): Promise<Cue[]> {
  const existing = tracks.get(bvid)
  if (existing) return existing

  const fetching = (async () => {
    const info = await fetchVideoInfo(bvid)
    if (!info) return []
    return (await fetchSubtitles({ aid: info.aid, cid: info.cid, bvid })) ?? []
  })().catch((e: unknown) => {
    tracks.delete(bvid)
    console.warn('[bb-subsgen] track fetch failed', e)
    return [] as Cue[]
  })

  tracks.set(bvid, fetching)
  return fetching
}

async function knownSet(): Promise<Set<string>> {
  const stored = await chrome.storage.local.get(KNOWN_SET_KEY)
  return new Set((stored[KNOWN_SET_KEY] as string[] | undefined) ?? [])
}

export interface ExplainRequest {
  /** The line as it was captured — what the passage is located by. */
  line: string
  /** The word being asked about, when the button was pressed on one. */
  target?: string
  bvid?: string
  start?: number
  sourceTitle?: string
  /** The flashcard this came from, so the conversation can be found from it. */
  itemId?: string
}

/**
 * Everything the model is given about the line, assembled.
 *
 * Every enrichment is best-effort: a video that has gone, a dictionary that is
 * still loading, a segmenter with no lexicon yet. Each failure costs its own
 * contribution and nothing else, because the single line was always enough to
 * ask about and the rest is improvement on top of it.
 */
export async function buildExplainContext(req: ExplainRequest): Promise<ChatContext> {
  const context: ChatContext = {
    line: req.line,
    before: [],
    after: [],
    ...(req.target !== undefined ? { target: req.target } : {}),
    ...(req.bvid !== undefined ? { bvid: req.bvid } : {}),
    ...(req.start !== undefined ? { start: req.start } : {}),
    ...(req.sourceTitle !== undefined ? { sourceTitle: req.sourceTitle } : {}),
  }

  const requestId = newRequestId()

  if (req.bvid) {
    const cues = await trackFor(req.bvid)
    const found = cues.length ? lineWindow(cues, req.line, req.start) : null

    if (found) {
      context.before = found.before
      context.after = found.after
    } else {
      // Not a failure worth interrupting for, but worth being able to find:
      // it means a re-cut track, or the wrong part of a multi-part video.
      log({
        level: 'warn',
        kind: 'explain',
        requestId,
        message: cues.length
          ? 'That line is not in this video’s track — explaining it on its own.'
          : 'No subtitle track came back — explaining the line on its own.',
        detail: `bvid ${req.bvid}, start ${req.start ?? '—'}\n${req.line}`,
      })
    }
  }

  try {
    const [lexicon, known] = await Promise.all([loadWords(), knownSet()])
    const words = hanWords(segment(req.line, lexicon))
    const defs = await lookupDefs(words)
    const { known: mastered, fresh } = splitByKnown(words, known, defs)

    context.knownWords = mastered
    context.newWords = fresh
  } catch (e) {
    log({
      level: 'warn',
      kind: 'explain',
      requestId,
      message: 'Could not gloss the line; asking without a dictionary.',
      detail: String(e),
    })
  }

  return context
}

/** Creates the conversation and returns its id, ready to open. */
export async function openExplainChat(req: ExplainRequest): Promise<string> {
  const [settings, context] = await Promise.all([loadSettings(), buildExplainContext(req)])

  const chat = await createChat({
    model: settings.llmChatModel,
    title: req.target ? `Explain 「${req.target}」` : 'Explain a line',
    ...(req.itemId !== undefined ? { itemId: req.itemId } : {}),
    context,
  })

  log({
    level: 'info',
    kind: 'explain',
    requestId: newRequestId(),
    model: settings.llmChatModel,
    message: `Opened an explanation with ${context.before.length + context.after.length} lines of context`,
    detail: [
      ...context.before,
      `>> ${context.line}`,
      ...context.after,
    ].join('\n'),
  })

  return chat.id
}

/** The opening question, asked on your behalf so the drawer arrives already working. */
export { explainQuestion }
