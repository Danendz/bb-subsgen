// Every write to the flashcards database, owned by the service worker.
//
// Content scripts cannot open this store at all — they run on the page's
// IndexedDB origin — so they buffer and post batches here. See flashcards/db.ts.
//
// Each operation comes in two forms, following defs-store.ts: a `...In(db, …)`
// core that tests drive against a throwaway database, and a thin wrapper that
// resolves the memoized one.
//
// Note the shape of every read-modify-write below: `upsert` issues its put
// inside the get's success handler rather than after an await. Awaiting mid
// transaction lets it auto-commit, and the write silently never lands.

import { done, flashcardsDb, request, upsert, STORES } from '../flashcards/db'
import { isKnown, KNOWN_SET_KEY } from '../flashcards/known'
import { schedule } from '../flashcards/scheduler'
import { emptyBackup, type Backup } from '../flashcards/backup'
import {
  sentenceId,
  wordId,
  type Context,
  type Grade,
  type Review,
  type ReviewStyle,
  type Exposure,
  type ExposureBatch,
  type Item,
  type Rank,
  type Signal,
  type Video,
  type VideoWord,
} from '../flashcards/types'

const RANKS_VERSION_KEY = 'bbSubsgenRanksVersion'
const CURRENT_RANKS_VERSION = 1

function newItem(id: string, kind: Item['kind'], text: string, now: number): Item {
  return {
    id,
    kind,
    text,
    // Words are discovered because you didn't know them, so they enter the
    // deck directly. Sentences land in the pool and are rationed out.
    state: kind === 'word' ? 'new' : 'pool',
    interval: 0,
    ease: 2.5,
    due: now,
    reps: 0,
    lapses: 0,
    createdAt: now,
    contexts: [],
  }
}

/** Keeps a bounded, most-recent-last history of where a word was met. */
const MAX_CONTEXTS = 20

function withContext(item: Item, context: Context | undefined): Item {
  if (!context) return item
  // The same line met again is not a new context — it is the same evidence.
  const seen = item.contexts.some(
    (c) => c.text === context.text && c.bvid === context.bvid && c.url === context.url,
  )
  if (seen) return item
  return { ...item, contexts: [...item.contexts, context].slice(-MAX_CONTEXTS) }
}

/**
 * Folds a flush of exposures into the totals.
 *
 * One transaction across all three stores: a 30-minute video is roughly 3,000
 * word instances, and a transaction per word would be the single heaviest thing
 * the extension does.
 */
export async function recordExposuresIn(db: IDBDatabase, batch: ExposureBatch): Promise<void> {
  const entries = Object.entries(batch.words)
  if (!entries.length && !batch.video) return

  const now = Date.now()
  const stores = batch.video
    ? [STORES.exposures, STORES.videoWords, STORES.videos]
    : [STORES.exposures]
  const tx = db.transaction(stores, 'readwrite')

  const exposures = tx.objectStore(STORES.exposures)
  for (const [headword, count] of entries) {
    upsert<Exposure>(exposures, headword, (existing) =>
      existing
        ? { ...existing, count: existing.count + count, lastSeen: now }
        : { headword, count, firstSeen: now, lastSeen: now },
    )
  }

  if (batch.video) {
    const { bvid, title, url } = batch.video

    const videoWords = tx.objectStore(STORES.videoWords)
    for (const [headword, count] of entries) {
      upsert<VideoWord>(videoWords, [bvid, headword], (existing) =>
        existing ? { ...existing, count: existing.count + count } : { bvid, headword, count },
      )
    }

    upsert<Video>(tx.objectStore(STORES.videos), bvid, (existing) =>
      existing
        ? { ...existing, title, url, lastWatched: now, lines: existing.lines + batch.lines }
        : { bvid, title, url, firstWatched: now, lastWatched: now, lines: batch.lines },
    )
  }

  await done(tx)
}

/** Ranks are immutable once imported, so reading them in their own transaction is safe. */
async function rankOf(db: IDBDatabase, headword: string): Promise<number | undefined> {
  const store = db.transaction(STORES.ranks, 'readonly').objectStore(STORES.ranks)
  const rank = await request<Rank | undefined>(store.get(headword))
  return rank?.rank
}

/**
 * Adds a word to the deck, or records another sighting of one already there.
 *
 * Never demotes: discovering a word you had marked known leaves it known. You
 * can hover a known word for its definition without that being a claim you have
 * forgotten it.
 */
export async function discoverWordIn(
  db: IDBDatabase,
  headword: string,
  context?: Context,
): Promise<void> {
  const rank = await rankOf(db, headword)
  const id = wordId(headword)
  const now = Date.now()

  const tx = db.transaction(STORES.items, 'readwrite')
  upsert<Item>(tx.objectStore(STORES.items), id, (existing) =>
    withContext(existing ?? { ...newItem(id, 'word', headword, now), rank }, context),
  )
  await done(tx)
}

/** Captures a line into the intake pool. A line already held only gains the context. */
export async function captureSentenceIn(
  db: IDBDatabase,
  text: string,
  context: Context,
  target?: string,
): Promise<void> {
  const id = sentenceId(text)
  const now = Date.now()

  const tx = db.transaction(STORES.items, 'readwrite')
  upsert<Item>(tx.objectStore(STORES.items), id, (existing) =>
    withContext(existing ?? { ...newItem(id, 'sentence', text.trim(), now), target }, context),
  )
  await done(tx)
}

/**
 * Declares a word known, or takes that back.
 *
 * Marking known keeps any review history but stops scheduling it. Un-marking
 * returns the word to the deck as new rather than restoring whatever interval
 * it had — "I don't actually know this" is a stronger statement than a stale
 * interval.
 */
export async function markKnownIn(
  db: IDBDatabase,
  headword: string,
  known: boolean,
): Promise<void> {
  const id = wordId(headword)
  const now = Date.now()

  const tx = db.transaction(STORES.items, 'readwrite')
  upsert<Item>(tx.objectStore(STORES.items), id, (existing) => {
    const base = existing ?? newItem(id, 'word', headword, now)
    return known ? { ...base, state: 'known' } : { ...base, state: 'new', interval: 0, due: now }
  })
  await done(tx)
}

/** Every word the overlay should stop annotating. */
export async function knownWordsIn(db: IDBDatabase): Promise<string[]> {
  const store = db.transaction(STORES.items, 'readonly').objectStore(STORES.items)
  const all = await request<Item[]>(store.getAll())
  return all.filter((item) => item.kind === 'word' && isKnown(item)).map((item) => item.text)
}

/**
 * Records a review and reschedules the card.
 *
 * The item and the log entry go in one transaction: a schedule that moved with
 * no log entry behind it would be exactly the state the import merge cannot
 * reconstruct, since replay is what makes two histories combinable.
 *
 * Returns the rescheduled item so the caller can tell whether it has just
 * crossed into "known" and the overlay needs to hear about it.
 */
export async function applyReviewIn(
  db: IDBDatabase,
  item: Item,
  grade: Grade,
  style: ReviewStyle,
  now = Date.now(),
): Promise<Item> {
  const next: Item = {
    ...item,
    ...schedule(item, grade, now),
    // Introduction is the first review, not a separate promotion step — which
    // is what lets the daily intake limits be counted from the items
    // themselves rather than from a counter that an import would have to merge.
    introducedAt: item.introducedAt ?? now,
  }

  const review: Review = {
    itemId: item.id,
    at: now,
    grade,
    style,
    intervalBefore: item.interval,
    intervalAfter: next.interval,
  }

  const tx = db.transaction([STORES.items, STORES.reviews], 'readwrite')
  tx.objectStore(STORES.items).put(next)
  tx.objectStore(STORES.reviews).put(review)
  await done(tx)

  return next
}

export async function recordSignalIn(db: IDBDatabase, signal: Signal): Promise<void> {
  const tx = db.transaction(STORES.signals, 'readwrite')
  tx.objectStore(STORES.signals).put(signal)
  await done(tx)
}

/** Everything worth carrying to another browser. See flashcards/backup.ts. */
export async function exportBackupIn(db: IDBDatabase): Promise<Backup> {
  const read = <T>(store: string) =>
    request<T[]>(db.transaction(store, 'readonly').objectStore(store).getAll())

  const [items, reviews, exposures, videoWordRows, videos] = await Promise.all([
    read<Item>(STORES.items),
    read<Review>(STORES.reviews),
    read<Exposure>(STORES.exposures),
    read<VideoWord>(STORES.videoWords),
    read<Video>(STORES.videos),
  ])

  return {
    ...emptyBackup(),
    items,
    // `seq` is an autoIncrement key from *this* database and means nothing in
    // another one; carrying it would collide on import.
    reviews: reviews.map(({ itemId, at, grade, style, intervalBefore, intervalAfter }) => ({
      itemId,
      at,
      grade,
      style,
      intervalBefore,
      intervalAfter,
    })),
    exposures,
    videoWords: videoWordRows,
    videos,
  }
}

/**
 * Replaces the study history wholesale.
 *
 * Always given the *merged* result rather than the imported file, so this
 * clearing is not destructive — see `merge`, which is what guarantees the local
 * history is already inside what's being written.
 */
export async function restoreIn(db: IDBDatabase, backup: Backup): Promise<void> {
  const stores = [
    STORES.items,
    STORES.reviews,
    STORES.exposures,
    STORES.videoWords,
    STORES.videos,
  ]
  const tx = db.transaction(stores, 'readwrite')

  for (const store of stores) tx.objectStore(store).clear()
  for (const item of backup.items) tx.objectStore(STORES.items).put(item)
  for (const review of backup.reviews) tx.objectStore(STORES.reviews).put(review)
  for (const exposure of backup.exposures) tx.objectStore(STORES.exposures).put(exposure)
  for (const word of backup.videoWords) tx.objectStore(STORES.videoWords).put(word)
  for (const video of backup.videos) tx.objectStore(STORES.videos).put(video)

  await done(tx)
}

/** Parses `headword\trank\thsk` lines; either numeric column may be blank. */
export function parseRanks(raw: string): Rank[] {
  const rows: Rank[] = []
  for (const line of raw.split('\n')) {
    if (!line) continue
    const [headword, rank, hsk] = line.split('\t')
    if (!headword) continue
    rows.push({
      headword,
      ...(rank ? { rank: Number(rank) } : {}),
      ...(hsk ? { hsk: Number(hsk) } : {}),
    })
  }
  return rows
}

export async function importRanksIn(db: IDBDatabase, rows: Rank[]): Promise<void> {
  const tx = db.transaction(STORES.ranks, 'readwrite')
  const store = tx.objectStore(STORES.ranks)
  for (const row of rows) store.put(row)
  await done(tx)
}

// --- Wrappers over the memoized database ------------------------------------

export async function recordExposures(batch: ExposureBatch): Promise<void> {
  return recordExposuresIn(await flashcardsDb(), batch)
}

export async function discoverWord(headword: string, context?: Context): Promise<void> {
  return discoverWordIn(await flashcardsDb(), headword, context)
}

export async function captureSentence(
  text: string,
  context: Context,
  target?: string,
): Promise<void> {
  return captureSentenceIn(await flashcardsDb(), text, context, target)
}

export async function markKnown(headword: string, known: boolean): Promise<void> {
  await markKnownIn(await flashcardsDb(), headword, known)
  await refreshKnownMirror()
}

export async function recordSignal(signal: Signal): Promise<void> {
  return recordSignalIn(await flashcardsDb(), signal)
}

export async function exportBackup(): Promise<Backup> {
  return exportBackupIn(await flashcardsDb())
}

/** Writes a merged history and republishes the known set it implies. */
export async function restore(backup: Backup): Promise<void> {
  await restoreIn(await flashcardsDb(), backup)
  await refreshKnownMirror()
}

/**
 * Reviews a card, republishing the known set only when this changed it.
 *
 * Refreshing unconditionally would read every item back and rewrite the mirror
 * after each of a hundred reviews in a session, for a set that changes on maybe
 * one of them.
 */
export async function applyReview(
  item: Item,
  grade: Grade,
  style: ReviewStyle,
  now = Date.now(),
): Promise<Item> {
  const next = await applyReviewIn(await flashcardsDb(), item, grade, style, now)
  if (isKnown(item) !== isKnown(next)) await refreshKnownMirror()
  return next
}

/**
 * Publishes the known set where content scripts can read it synchronously.
 *
 * Hiding pinyin is a per-token decision on every rendered line; a message round
 * trip per line is not viable. Content scripts read this once and then follow
 * `chrome.storage.onChanged`, the same pattern as `onSettingsChanged`.
 */
export async function refreshKnownMirror(): Promise<void> {
  const known = await knownWordsIn(await flashcardsDb())
  await chrome.storage.local.set({ [KNOWN_SET_KEY]: known })
}

/**
 * Imports the frequency/HSK artifact once, if the build produced one.
 *
 * Optional by design: the dataset is the one piece of this feature that cannot
 * be derived from CC-CEDICT, and its licensing has to be verified before it can
 * ship. Without it every rank is undefined, which costs frequency-ordered
 * introduction and the HSK progress denominator — and nothing else.
 */
export async function ensureRanksImported(): Promise<void> {
  const { [RANKS_VERSION_KEY]: version } = await chrome.storage.local.get(RANKS_VERSION_KEY)
  if (version === CURRENT_RANKS_VERSION) return

  let raw: string
  try {
    const response = await fetch(chrome.runtime.getURL('dict/rank.bin'))
    if (!response.ok) throw new Error(`rank.bin: ${response.status}`)
    raw = await response.text()
  } catch {
    // No dataset built in. Not an error, and the flag stays unset so dropping
    // one in later still imports it.
    return
  }

  await importRanksIn(await flashcardsDb(), parseRanks(raw))
  await chrome.storage.local.set({ [RANKS_VERSION_KEY]: CURRENT_RANKS_VERSION })
}
