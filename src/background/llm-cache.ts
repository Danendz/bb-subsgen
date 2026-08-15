// Translations the model has already produced.
//
// A full track is tens of minutes of generation, and rewatching is not an edge
// case in language learning — it is most of the method. Without this, closing
// the tab throws all of it away and the second viewing costs exactly as much as
// the first.
//
// Keyed by (video, language, model, cue start) rather than by cue index. Index
// is positional and a re-fetched track can be re-cut; start is the identity
// `Context` already persists. Model is in the key because two models produce
// different translations and neither is a stale version of the other.

import { done, request } from '../shared/idb'
import { llmDb, STORES } from '../llm/db'
import type { TranslationLang } from '../shared/settings'

/**
 * How many videos' translations are kept.
 *
 * Evicted whole videos at a time rather than individual lines: half a cached
 * track is worth much less than a whole one, and a video is the unit you
 * actually come back to.
 */
export const MAX_CACHED_VIDEOS = 50

export interface CachedLine {
  bvid: string
  lang: TranslationLang
  model: string
  /** Cue start in seconds. */
  start: number
  text: string
  at: number
}

export interface TrackKey {
  bvid: string
  lang: TranslationLang
  model: string
}

/** Everything cached for one video, as start -> translation. */
export async function readTrackIn(
  db: IDBDatabase,
  { bvid, lang, model }: TrackKey,
): Promise<Map<number, string>> {
  const tx = db.transaction(STORES.lines, 'readonly')
  const rows = (await request(
    tx.objectStore(STORES.lines).index('by-video').getAll(bvid),
  )) as CachedLine[]

  return new Map(
    rows.filter((row) => row.lang === lang && row.model === model).map((row) => [row.start, row.text]),
  )
}

export async function writeLinesIn(
  db: IDBDatabase,
  key: TrackKey,
  lines: Array<{ start: number; text: string }>,
): Promise<void> {
  if (!lines.length) return

  const at = Date.now()
  const tx = db.transaction(STORES.lines, 'readwrite')
  const store = tx.objectStore(STORES.lines)
  for (const line of lines) store.put({ ...key, start: line.start, text: line.text, at })
  await done(tx)
}

/**
 * Drops the least recently written videos until only `max` remain.
 *
 * Recency is taken from the newest line in each video, so a track still being
 * translated is never the one evicted.
 */
export async function evictIn(db: IDBDatabase, max = MAX_CACHED_VIDEOS): Promise<number> {
  // Deliberately two transactions. Deciding what to drop needs the whole store
  // read first, and a write issued after awaiting a read lands on a transaction
  // that has already auto-committed — see the note on `upsert` in shared/idb.ts.
  // Nothing else writes here, so there is no race worth holding a lock for.
  const read = db.transaction(STORES.lines, 'readonly')
  const rows = (await request(read.objectStore(STORES.lines).getAll())) as CachedLine[]

  const newest = new Map<string, number>()
  for (const row of rows) {
    newest.set(row.bvid, Math.max(newest.get(row.bvid) ?? 0, row.at))
  }
  if (newest.size <= max) return 0

  const doomed = new Set(
    [...newest.entries()]
      .sort((a, b) => a[1] - b[1])
      .slice(0, newest.size - max)
      .map(([bvid]) => bvid),
  )

  const tx = db.transaction(STORES.lines, 'readwrite')
  const store = tx.objectStore(STORES.lines)
  for (const row of rows) {
    if (doomed.has(row.bvid)) store.delete([row.bvid, row.lang, row.model, row.start])
  }
  await done(tx)
  return doomed.size
}

export async function clearCacheIn(db: IDBDatabase): Promise<void> {
  const tx = db.transaction(STORES.lines, 'readwrite')
  tx.objectStore(STORES.lines).clear()
  await done(tx)
}

/** How much is cached, for the Data tab to report before offering to wipe it. */
export async function cacheSizeIn(db: IDBDatabase): Promise<{ videos: number; lines: number }> {
  const tx = db.transaction(STORES.lines, 'readonly')
  const rows = (await request(tx.objectStore(STORES.lines).getAll())) as CachedLine[]

  return { videos: new Set(rows.map((row) => row.bvid)).size, lines: rows.length }
}

export async function readTrack(key: TrackKey): Promise<Map<number, string>> {
  return readTrackIn(await llmDb(), key)
}

export async function writeLines(
  key: TrackKey,
  lines: Array<{ start: number; text: string }>,
): Promise<void> {
  return writeLinesIn(await llmDb(), key, lines)
}

export async function evict(max?: number): Promise<number> {
  return evictIn(await llmDb(), max)
}

export async function clearCache(): Promise<void> {
  return clearCacheIn(await llmDb())
}

export async function cacheSize(): Promise<{ videos: number; lines: number }> {
  return cacheSizeIn(await llmDb())
}
