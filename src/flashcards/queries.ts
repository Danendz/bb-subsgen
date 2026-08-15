// Reads against the flashcards database, plus the pure derivations built on
// them. Only the service worker and the study app can call these — content
// scripts run on the page's IndexedDB origin. See db.ts.

import { request, STORES } from './db'
import { isKnown } from './known'
import { previousDay, startOfDay } from './scheduler'
import type { Exposure, Item, Rank, Review, Video, VideoWord } from './types'

function all<T>(db: IDBDatabase, store: string): Promise<T[]> {
  return request<T[]>(db.transaction(store, 'readonly').objectStore(store).getAll())
}

export function listItems(db: IDBDatabase): Promise<Item[]> {
  return all<Item>(db, STORES.items)
}

export function listVideos(db: IDBDatabase): Promise<Video[]> {
  return all<Video>(db, STORES.videos)
}

export function listExposures(db: IDBDatabase): Promise<Exposure[]> {
  return all<Exposure>(db, STORES.exposures)
}

export function listRanks(db: IDBDatabase): Promise<Rank[]> {
  return all<Rank>(db, STORES.ranks)
}

export function getItem(db: IDBDatabase, id: string): Promise<Item | undefined> {
  return request<Item | undefined>(
    db.transaction(STORES.items, 'readonly').objectStore(STORES.items).get(id),
  )
}

/** Every word counted in one video, via the by-video index. */
export function videoWords(db: IDBDatabase, bvid: string): Promise<VideoWord[]> {
  const index = db
    .transaction(STORES.videoWords, 'readonly')
    .objectStore(STORES.videoWords)
    .index('by-video')
  return request<VideoWord[]>(index.getAll(IDBKeyRange.only(bvid)))
}

/** The words the overlay stops annotating — the same rule the mirror publishes. */
export function knownSetOf(items: Item[]): Set<string> {
  return new Set(items.filter((item) => item.kind === 'word' && isKnown(item)).map((i) => i.text))
}

/**
 * Days studied in an unbroken run, counting back from today.
 *
 * Derived from the review log rather than stored. A streak kept as its own
 * counter is state that can disagree with the history behind it, and worse, it
 * is state an import would have to merge — there is no honest way to combine
 * two machines' streak counters, but there is an obvious way to combine their
 * review logs, which is what this reads.
 *
 * Walks the `by-at` index backwards and stops at the first missing day, so it
 * costs the length of the streak rather than the length of the history.
 */
export function studyStreak(db: IDBDatabase, now = Date.now()): Promise<number> {
  const index = db
    .transaction(STORES.reviews, 'readonly')
    .objectStore(STORES.reviews)
    .index('by-at')

  return new Promise((resolve, reject) => {
    const req = index.openCursor(null, 'prev')
    let counting: number | null = null
    let streak = 0

    req.onerror = () => reject(req.error)
    req.onsuccess = () => {
      const cursor = req.result
      if (!cursor) return resolve(streak)

      const day = startOfDay((cursor.value as Review).at)

      if (counting === null) {
        // Today's streak is intact until the day is over, so a log that stops
        // yesterday still counts. Anything older means it has already lapsed.
        const today = startOfDay(now)
        if (day !== today && day !== previousDay(today)) return resolve(0)
        counting = day
        streak = 1
      } else if (day === previousDay(counting)) {
        counting = day
        streak += 1
      } else if (day !== counting) {
        // A gap. Everything below it belongs to an older run.
        return resolve(streak)
      }

      cursor.continue()
    }
  })
}

export interface HskProgress {
  level: number
  known: number
  total: number
}

/**
 * Known words per HSK level.
 *
 * The denominator is what makes this worth showing: "612 of 1,200 HSK 4" is a
 * position you can act on, where "612 of 120,000 CC-CEDICT headwords" — most of
 * them proper nouns and technical terms nobody studies — is noise. Empty when
 * no HSK dataset was built in, and the app renders nothing rather than a chart
 * of zeroes.
 */
export function hskProgress(ranks: Rank[], known: ReadonlySet<string>): HskProgress[] {
  const totals = new Map<number, { known: number; total: number }>()
  for (const { headword, hsk } of ranks) {
    if (hsk === undefined) continue
    const bucket = totals.get(hsk) ?? { known: 0, total: 0 }
    bucket.total += 1
    if (known.has(headword)) bucket.known += 1
    totals.set(hsk, bucket)
  }
  return [...totals.entries()]
    .map(([level, bucket]) => ({ level, ...bucket }))
    .sort((a, b) => a.level - b.level)
}

export interface DeckCounts {
  words: number
  known: number
  sentences: number
  /** Grammar patterns collected. */
  grammar: number
  /** Lines and patterns waiting in the intake pool. */
  pool: number
}

/**
 * Only lines have an intake pool, so only they are counted waiting.
 *
 * Words used to be pooled as well and counted separately here. They are now
 * studiable the moment they are collected, which makes `words` minus `known`
 * the whole story about them.
 */
export function deckCounts(items: Item[]): DeckCounts {
  let words = 0
  let known = 0
  let sentences = 0
  let grammar = 0
  let pool = 0
  for (const item of items) {
    if (item.kind === 'word') {
      words += 1
      if (isKnown(item)) known += 1
      continue
    }
    if (item.kind === 'grammar') grammar += 1
    else sentences += 1
    // Both are rationed the same way, so both count as waiting.
    if (item.state === 'pool') pool += 1
  }
  return { words, known, sentences, grammar, pool }
}
