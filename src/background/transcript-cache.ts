// Transcripts the speech model has already produced.
//
// The same reasoning as llm-cache.ts next door, and the same shape, but the
// stakes are different in one way worth naming: a translation that is missing
// costs you a translated line, while a transcript that is missing costs you the
// *subtitles*. On a bangumi episode there is nothing else — no track to fall
// back on — so the difference between a hit and a miss here is the difference
// between a page that works and a page that does not.
//
// It is also what makes the GPU cost bearable. Transcribing an episode is two or
// three minutes of a laptop's fans; doing it once ever, rather than once per
// viewing, is what turns that from a reason not to use the feature into a cost
// you pay attention to exactly once.
//
// Keyed by (video, model, cue start). Model is in the key because two models
// produce different transcripts and neither is a stale version of the other —
// swapping `large-v3-turbo` for a Mandarin-tuned model should not silently serve
// you the old one's mistakes.

import { done, request } from '../shared/idb'
import { llmDb, STORES } from '../llm/db'
import type { Cue } from '../media/cue'

/**
 * How many videos' transcripts are kept.
 *
 * Smaller than the translation cache's fifty because the rows are bigger — a
 * transcript is every line of an episode — and because the thing being protected
 * is a rewatch, which happens soon after the first viewing or not at all.
 */
export const MAX_CACHED_TRANSCRIPTS = 20

export interface CachedCue {
  videoId: string
  model: string
  /** Cue start in seconds — its identity, as everywhere else in this codebase. */
  start: number
  end: number
  text: string
  at: number
}

export interface TranscriptKey {
  videoId: string
  model: string
}

/** The cues cached for one video, in track order. Empty when there are none. */
export async function readTranscriptIn(
  db: IDBDatabase,
  { videoId, model }: TranscriptKey,
): Promise<Cue[]> {
  const tx = db.transaction(STORES.transcripts, 'readonly')
  const rows = (await request(
    tx.objectStore(STORES.transcripts).index('by-video').getAll(videoId),
  )) as CachedCue[]

  return rows
    .filter((row) => row.model === model)
    .map((row) => ({ start: row.start, end: row.end, text: row.text }))
    .sort((a, b) => a.start - b.start)
}

/**
 * The cues cached for one video, whichever model produced them.
 *
 * For readers that want the *lines* rather than a particular model's opinion of
 * them — rebuilding the passage around a word, say. Asking by model is right for
 * the transcription run, which must not be handed another model's work as though
 * it were its own; it is wrong here, where the caller has a word it collected
 * months ago and no idea what was running at the time.
 *
 * Where two models have both transcribed a video, the most recently written one
 * wins. Merging them would interleave two transcripts of the same audio.
 */
export async function readAnyTranscriptIn(db: IDBDatabase, videoId: string): Promise<Cue[]> {
  const tx = db.transaction(STORES.transcripts, 'readonly')
  const rows = (await request(
    tx.objectStore(STORES.transcripts).index('by-video').getAll(videoId),
  )) as CachedCue[]
  if (!rows.length) return []

  const newest = rows.reduce((best, row) => (row.at > best.at ? row : best))
  return rows
    .filter((row) => row.model === newest.model)
    .map((row) => ({ start: row.start, end: row.end, text: row.text }))
    .sort((a, b) => a.start - b.start)
}

/**
 * Stores a finished transcript.
 *
 * Written only when a run completes, never as chunks land. A half-written
 * transcript is indistinguishable from a whole one once it is in the store, and
 * serving one would silently give you an episode whose subtitles stop in the
 * middle — a worse outcome than re-transcribing the two minutes that were lost
 * when a run was cancelled.
 */
export async function writeTranscriptIn(
  db: IDBDatabase,
  key: TranscriptKey,
  cues: Cue[],
): Promise<void> {
  if (!cues.length) return

  const at = Date.now()
  const tx = db.transaction(STORES.transcripts, 'readwrite')
  const store = tx.objectStore(STORES.transcripts)
  for (const cue of cues) {
    store.put({ ...key, start: cue.start, end: cue.end, text: cue.text, at })
  }
  await done(tx)
}

/**
 * Drops the least recently written transcripts until only `max` remain.
 *
 * Two transactions, for the reason spelled out in llm-cache.ts: a write issued
 * after awaiting a read lands on a transaction that has already auto-committed.
 */
export async function evictTranscriptsIn(
  db: IDBDatabase,
  max = MAX_CACHED_TRANSCRIPTS,
): Promise<number> {
  const read = db.transaction(STORES.transcripts, 'readonly')
  const rows = (await request(read.objectStore(STORES.transcripts).getAll())) as CachedCue[]

  const newest = new Map<string, number>()
  for (const row of rows) {
    newest.set(row.videoId, Math.max(newest.get(row.videoId) ?? 0, row.at))
  }
  if (newest.size <= max) return 0

  const doomed = new Set(
    [...newest.entries()]
      .sort((a, b) => a[1] - b[1])
      .slice(0, newest.size - max)
      .map(([videoId]) => videoId),
  )

  const tx = db.transaction(STORES.transcripts, 'readwrite')
  const store = tx.objectStore(STORES.transcripts)
  for (const row of rows) {
    if (doomed.has(row.videoId)) store.delete([row.videoId, row.model, row.start])
  }
  await done(tx)
  return doomed.size
}

export async function clearTranscriptsIn(db: IDBDatabase): Promise<void> {
  const tx = db.transaction(STORES.transcripts, 'readwrite')
  tx.objectStore(STORES.transcripts).clear()
  await done(tx)
}

/** How much is cached, for the Data tab to report before offering to wipe it. */
export async function transcriptSizeIn(
  db: IDBDatabase,
): Promise<{ videos: number; lines: number }> {
  const tx = db.transaction(STORES.transcripts, 'readonly')
  const rows = (await request(tx.objectStore(STORES.transcripts).getAll())) as CachedCue[]
  return { videos: new Set(rows.map((row) => row.videoId)).size, lines: rows.length }
}

export async function readTranscript(key: TranscriptKey): Promise<Cue[]> {
  return readTranscriptIn(await llmDb(), key)
}

export async function readAnyTranscript(videoId: string): Promise<Cue[]> {
  return readAnyTranscriptIn(await llmDb(), videoId)
}

export async function writeTranscript(key: TranscriptKey, cues: Cue[]): Promise<void> {
  return writeTranscriptIn(await llmDb(), key, cues)
}

export async function evictTranscripts(max?: number): Promise<number> {
  return evictTranscriptsIn(await llmDb(), max)
}

export async function clearTranscripts(): Promise<void> {
  return clearTranscriptsIn(await llmDb())
}

export async function transcriptSize(): Promise<{ videos: number; lines: number }> {
  return transcriptSizeIn(await llmDb())
}
