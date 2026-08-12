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

import { schedule } from './scheduler'
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
 * recorded on, and ranks are rebuilt from the extension's own build artifact —
 * carrying either would bloat the file with data the destination can regenerate
 * or should not inherit.
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
 */
export function replay(item: Item, reviews: Review[]): Item {
  const ordered = reviews.filter((r) => r.itemId === item.id).sort((a, b) => a.at - b.at)
  if (!ordered.length) return { ...item, introducedAt: undefined }

  let state = { interval: 0, ease: 2.5, reps: 0, lapses: 0 }
  let due = item.due
  let itemState: Item['state'] = item.state

  for (const review of ordered) {
    const next = schedule(state, review.grade, review.at)
    state = { interval: next.interval, ease: next.ease, reps: next.reps, lapses: next.lapses }
    due = next.due
    itemState = next.state
  }

  return { ...item, ...state, due, state: itemState, introducedAt: ordered[0].at }
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
    rank: local.rank ?? incoming.rank,
    target: local.target ?? incoming.target,
    contexts: mergeContexts(local, incoming),
    // When a declaration is overruled, the state has to come from the side that
    // did *not* declare it — falling back to the local state would quietly
    // reinstate the very "known" the user just chose to discard. Both sides
    // declaring it lands in the first branch, so exactly one can be 'known' here.
    state: declaredKnown ? 'known' : local.state === 'known' ? incoming.state : local.state,
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
