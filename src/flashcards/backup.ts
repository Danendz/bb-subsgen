// Moving your study history between browsers.
//
// Import merges rather than overwrites. Two exports from two machines are not
// really in conflict — they are two halves of one history — so the review logs
// are unioned and the schedule is *recomputed* by replaying them. Reviews done
// on a laptop and reviews done on a desktop both count, and the result is the
// state you would have had if you had used one browser all along.
//
// That leaves only genuine disagreements: a word declared known on one side and
// not the other. There is no evidence that can settle those, so they are the
// one thing the user is asked about — once, globally.

import { reschedules, schedule } from './scheduler'
import type { Exposure, Item, Review, Video, VideoWord } from './types'

export const BACKUP_VERSION = 1

export interface Backup {
  version: number
  exportedAt: number
  items: Item[]
  reviews: Review[]
  exposures: Exposure[]
  videoWords: VideoWord[]
  videos: Video[]
}

/**
 * Dwell samples and the frequency table are deliberately absent.
 *
 * Signals exist to calibrate one threshold against the machine they were
 * recorded on, and a word list is uploaded per browser and shared by every deck —
 * carrying either would bloat the file with data the destination either already
 * has or should not inherit.
 */
export function emptyBackup(): Backup {
  return {
    version: BACKUP_VERSION,
    exportedAt: Date.now(),
    items: [],
    reviews: [],
    exposures: [],
    videoWords: [],
    videos: [],
  }
}

export function isBackup(value: unknown): value is Backup {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Partial<Backup>
  return (
    typeof candidate.version === 'number' &&
    Array.isArray(candidate.items) &&
    Array.isArray(candidate.reviews)
  )
}

/** Identifies one review, for deduplicating the same event present in both files. */
function reviewKey(review: Review): string {
  return `${review.itemId}@${review.at}`
}

function mergeReviews(local: Review[], incoming: Review[]): Review[] {
  const byKey = new Map<string, Review>()
  for (const review of [...local, ...incoming]) byKey.set(reviewKey(review), review)
  return [...byKey.values()].sort((a, b) => a.at - b.at)
}

const MAX_CONTEXTS = 20

function mergeContexts(a: Item, b: Item): Item['contexts'] {
  const byKey = new Map<string, Item['contexts'][number]>()
  for (const context of [...a.contexts, ...b.contexts]) {
    byKey.set(`${context.text}|${context.bvid ?? ''}|${context.url ?? ''}`, context)
  }
  return [...byKey.values()].sort((x, y) => x.at - y.at).slice(-MAX_CONTEXTS)
}

function min(a: number | undefined, b: number | undefined): number | undefined {
  if (a === undefined) return b
  if (b === undefined) return a
  return Math.min(a, b)
}

/**
 * Rebuilds an item's schedule from its reviews.
 *
 * This is what makes merging possible at all: the schedule is derived, never
 * authoritative, so combining two logs and replaying gives a well-defined
 * answer instead of a choice between two stale intervals. It is also what would
 * let SM-2 be swapped for something better without a migration.
 *
 * Extra practice is replayed by the same rule the store applies when it writes
 * it (`reschedules`), so an imported deck lands exactly where the browser that
 * recorded the history had it.
 */
export function replay(item: Item, reviews: Review[]): Item {
  const ordered = reviews.filter((r) => r.itemId === item.id).sort((a, b) => a.at - b.at)
  if (!ordered.length) return { ...item, introducedAt: undefined }

  // Starts at the bottom of the ladder, not at the item's current position: the
  // point of a replay is to derive the schedule from the log alone, so whatever
  // either side happened to have stored is deliberately ignored.
  let state = { interval: 0, level: 0, ease: 2.5, reps: 0, lapses: 0 }
  let due = item.due
  let itemState: Item['state'] = item.state
  // The first review that moved the card, not simply the first row. A card is
  // introduced by being scheduled; being drilled is not the same event.
  let introducedAt: number | undefined

  for (const review of ordered) {
    if (!reschedules(review)) {
      state = { ...state, reps: state.reps + 1 }
      continue
    }

    const next = schedule(state, review.grade, review.at)
    state = {
      interval: next.interval,
      level: next.level,
      ease: next.ease,
      reps: next.reps,
      lapses: next.lapses,
    }
    due = next.due
    itemState = next.state
    introducedAt ??= review.at
  }

  return { ...item, ...state, due, state: itemState, introducedAt }
}

export interface Conflict {
  id: string
  text: string
  /** Whether each side declares this word known. They disagree, or it isn't here. */
  local: boolean
  incoming: boolean
}

/**
 * Words declared known on one side and not the other.
 *
 * Only declarations count. A word that is mature on one side and new on the
 * other is not a conflict — that is exactly what replaying the merged log
 * settles.
 */
export function conflictsOf(local: Backup, incoming: Backup): Conflict[] {
  const byId = new Map(local.items.map((item) => [item.id, item]))
  const conflicts: Conflict[] = []

  for (const item of incoming.items) {
    const mine = byId.get(item.id)
    if (!mine) continue
    const a = mine.state === 'known'
    const b = item.state === 'known'
    if (a !== b) conflicts.push({ id: item.id, text: item.text, local: a, incoming: b })
  }

  return conflicts
}

/**
 * Which side's state survives the merge.
 *
 * When a declaration is overruled, the state has to come from the side that did
 * *not* declare it — falling back to the other would quietly reinstate the very
 * "known" the user just chose to discard.
 *
 * Past that, the local side wins except when it holds the card in the pool. The
 * pool is the weakest state a card can be in: collected, with nothing yet having
 * happened to it. Taking the local state unconditionally would let importing on
 * the machine that only ever watched undo a lookup made on the machine you
 * study on — and which browser you happen to import into is not a fact about
 * the card. Leaving the pool is one-way here for the same reason it is one-way
 * in `discoveredWord`.
 */
function mergeState(local: Item, incoming: Item, declaredKnown: boolean): Item['state'] {
  if (declaredKnown) return 'known'
  if (local.state === 'known') return incoming.state
  if (incoming.state === 'known') return local.state
  return local.state === 'pool' ? incoming.state : local.state
}

function mergeItem(local: Item, incoming: Item, prefer: 'local' | 'incoming'): Item {
  const declaredKnown =
    local.state === 'known' && incoming.state === 'known'
      ? true
      : local.state === 'known' || incoming.state === 'known'
        ? prefer === 'local'
          ? local.state === 'known'
          : incoming.state === 'known'
        : false

  return {
    ...local,
    ...incoming,
    // The earliest sighting is the true one; the later file just met it again.
    createdAt: Math.min(local.createdAt, incoming.createdAt),
    introducedAt: min(local.introducedAt, incoming.introducedAt),
    target: local.target ?? incoming.target,
    contexts: mergeContexts(local, incoming),
    state: mergeState(local, incoming, declaredKnown),
  }
}

function mergeExposures(local: Exposure[], incoming: Exposure[]): Exposure[] {
  const byWord = new Map(local.map((e) => [e.headword, e]))
  for (const entry of incoming) {
    const mine = byWord.get(entry.headword)
    byWord.set(
      entry.headword,
      mine
        ? {
            headword: entry.headword,
            // Summed: you really did see it that many times, across both.
            count: mine.count + entry.count,
            firstSeen: Math.min(mine.firstSeen, entry.firstSeen),
            lastSeen: Math.max(mine.lastSeen, entry.lastSeen),
          }
        : entry,
    )
  }
  return [...byWord.values()]
}

function mergeVideoWords(local: VideoWord[], incoming: VideoWord[]): VideoWord[] {
  const byKey = new Map(local.map((w) => [`${w.bvid}|${w.headword}`, w]))
  for (const entry of incoming) {
    const key = `${entry.bvid}|${entry.headword}`
    const mine = byKey.get(key)
    byKey.set(key, mine ? { ...entry, count: mine.count + entry.count } : entry)
  }
  return [...byKey.values()]
}

function mergeVideos(local: Video[], incoming: Video[]): Video[] {
  const byId = new Map(local.map((v) => [v.bvid, v]))
  for (const entry of incoming) {
    const mine = byId.get(entry.bvid)
    byId.set(
      entry.bvid,
      mine
        ? {
            ...entry,
            title: entry.title || mine.title,
            lines: mine.lines + entry.lines,
            firstWatched: Math.min(mine.firstWatched, entry.firstWatched),
            lastWatched: Math.max(mine.lastWatched, entry.lastWatched),
          }
        : entry,
    )
  }
  return [...byId.values()]
}

export interface MergeOptions {
  /** Which side wins where both declare a word known differently. */
  prefer: 'local' | 'incoming'
}

export function merge(local: Backup, incoming: Backup, { prefer }: MergeOptions): Backup {
  const reviews = mergeReviews(local.reviews, incoming.reviews)

  const byId = new Map(local.items.map((item) => [item.id, item]))
  for (const item of incoming.items) {
    const mine = byId.get(item.id)
    byId.set(item.id, mine ? mergeItem(mine, item, prefer) : item)
  }

  const items = [...byId.values()].map((item) =>
    // A declared word stays declared: replay describes what studying did, and
    // "I already know this" is not something studying can contradict.
    item.state === 'known' ? item : replay(item, reviews),
  )

  return {
    version: BACKUP_VERSION,
    exportedAt: Date.now(),
    items,
    reviews,
    exposures: mergeExposures(local.exposures, incoming.exposures),
    videoWords: mergeVideoWords(local.videoWords, incoming.videoWords),
    videos: mergeVideos(local.videos, incoming.videos),
  }
}
