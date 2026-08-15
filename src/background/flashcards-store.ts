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
import { reschedules, schedule } from '../flashcards/scheduler'
import { emptyBackup, type Backup } from '../flashcards/backup'
import type { ListKind } from '../flashcards/wordlist'
import { PATTERNS, type Pattern } from '../lang/grammar/patterns'
import {
  grammarId,
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

/**
 * Where a newly collected item starts.
 *
 * Only lines get an intake pool. They are rationed by comprehensibility —
 * `graduationOrder` releases a line once its unknowns are few — which is a
 * judgement that needs the rest of the deck to have caught up first.
 *
 * Words used to be pooled too when they were met passively, on the grounds that
 * an evening's watching turns up hundreds. That rationed them so tightly that a
 * deck of dozens could not fill a twenty-card session, which is a worse failure
 * than a large deck: material you collected and cannot reach reads as the app
 * being broken. Every word is now studiable the moment it is collected, and
 * `studySessionSize` is what limits how fast they are actually met.
 */
function initialState(kind: Item['kind']): Item['state'] {
  return kind === 'word' ? 'new' : 'pool'
}

/**
 * The patterns behind a list of ids, dropping any the table does not know.
 *
 * The table is the source of truth for what a grammar card *is*: a card that
 * cannot render its own skeleton or explanation is worse than a missing one. So
 * an unrecognised id is ignored, which is also what makes removing a pattern
 * from the table safe for decks that already hold it.
 */
function knownPatterns(ids: string[]): Pattern[] {
  const wanted = new Set(ids)
  return PATTERNS.filter((pattern) => wanted.has(pattern.id))
}

function newGrammarItem(pattern: Pattern, now: number): Item {
  return {
    ...newItem(grammarId(pattern.id), 'grammar', pattern.skeleton, now),
    patternId: pattern.id,
  }
}

function newItem(id: string, kind: Item['kind'], text: string, now: number): Item {
  return {
    id,
    kind,
    text,
    state: initialState(kind),
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

/**
 * Adds a word, or records another sighting of one already collected.
 *
 * Never moves a word already held: discovering one you had marked known leaves
 * it known, and one part-way up the ladder keeps its schedule. You can hover a
 * known word for its definition without that being a claim you have forgotten
 * it. So a second sighting only ever adds context.
 *
 * Deliberately stores no frequency rank. A word list is uploaded whenever the
 * user gets round to it, usually long after words have been collected, so a
 * rank captured here would be missing on exactly the cards that need ordering.
 * The queue looks rank up instead — see `buildQueue`.
 */
function discoveredWord(
  existing: Item | undefined,
  headword: string,
  now: number,
  context: Context | undefined,
): Item {
  if (!existing) return withContext(newItem(wordId(headword), 'word', headword, now), context)
  return withContext(existing, context)
}

export async function discoverWordIn(
  db: IDBDatabase,
  headword: string,
  context?: Context,
): Promise<void> {
  const now = Date.now()

  const tx = db.transaction(STORES.items, 'readwrite')
  upsert<Item>(tx.objectStore(STORES.items), wordId(headword), (existing) =>
    discoveredWord(existing, headword, now, context),
  )
  await done(tx)
}

/**
 * Captures a line into the intake pool, with the words in it you don't yet know.
 *
 * Both in one transaction, because they are one event. A line is kept precisely
 * *because* it holds words you can't read (`shouldCaptureLine`), so collecting
 * the line and leaving its vocabulary behind builds a pool of sentences waiting
 * on words that nothing is feeding you — `graduationOrder` only releases a line
 * once its unknowns are few. Those words join the deck immediately, like any
 * other — it is the line that waits, not its vocabulary.
 *
 * Anything already held only gains the context.
 */
export async function captureSentenceIn(
  db: IDBDatabase,
  text: string,
  context: Context,
  target?: string,
  words: string[] = [],
  patterns: string[] = [],
): Promise<void> {
  const id = sentenceId(text)
  const now = Date.now()

  const tx = db.transaction(STORES.items, 'readwrite')
  const store = tx.objectStore(STORES.items)

  upsert<Item>(store, id, (existing) =>
    withContext(existing ?? { ...newItem(id, 'sentence', text.trim(), now), target }, context),
  )
  // Deduped: a line repeating a word is one card, and two `upsert`s on the same
  // key in one transaction both read before either writes.
  for (const word of new Set(words)) {
    upsert<Item>(store, wordId(word), (existing) =>
      discoveredWord(existing, word, now, context),
    )
  }
  // Same transaction as the line and its words. A pattern is only ever met *in*
  // a line, so splitting them would let a line land without the structure it
  // taught, or the reverse.
  //
  // Resolved to patterns before the loop rather than inside it: `upsert` always
  // writes what its updater returns, so an id with nothing behind it has to be
  // dropped before it can become a card with no skeleton.
  for (const pattern of knownPatterns(patterns)) {
    upsert<Item>(store, grammarId(pattern.id), (existing) =>
      withContext(existing ?? newGrammarItem(pattern, now), context),
    )
  }

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
  extra = false,
): Promise<Item> {
  const next: Item = reschedules({ grade, extra })
    ? {
        ...item,
        ...schedule(item, grade, now),
        // Introduction is the first review, not a separate promotion step — which
        // is what lets the daily intake limits be counted from the items
        // themselves rather than from a counter that an import would have to merge.
        introducedAt: item.introducedAt ?? now,
      }
    : // Asked, but not moved. `reps` is raised because that is exactly what it
      // records, and because it is what rotates the question style in mixed
      // mode — a card you drill should be met from a different angle each time
      // rather than the same one until it next comes due.
      { ...item, reps: item.reps + 1 }

  const review: Review = {
    itemId: item.id,
    at: now,
    grade,
    style,
    intervalBefore: item.interval,
    intervalAfter: next.interval,
    // Set only when true, so a scheduled review is written exactly as it always
    // was and the log gains no field on the rows that do not need one.
    ...(extra ? { extra: true } : {}),
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

// --- User-supplied word lists ------------------------------------------------

/** The `Rank` field each kind of list owns. Neither may disturb the other. */
const FIELD: Record<ListKind, 'rank' | 'hsk'> = { frequency: 'rank', hsk: 'hsk' }

/**
 * Replaces one kind of list, leaving the other kind's values alone.
 *
 * Both live on the same `ranks` row, so a frequency upload has to clear the old
 * `rank` across every row before writing the new one — otherwise words dropped
 * from the new list would keep a stale rank forever. Rows left holding neither
 * value are removed rather than kept as empty shells.
 */
export async function replaceWordListIn(
  db: IDBDatabase,
  kind: ListKind,
  rows: Array<{ headword: string; value: number }>,
): Promise<void> {
  const field = FIELD[kind]
  const other = kind === 'frequency' ? 'hsk' : 'rank'

  const existing = await request<Rank[]>(
    db.transaction(STORES.ranks, 'readonly').objectStore(STORES.ranks).getAll(),
  )
  const kept = new Map<string, Rank>()
  for (const row of existing) {
    // Only what the other list contributed survives this upload.
    if (row[other] !== undefined) kept.set(row.headword, { headword: row.headword, [other]: row[other] })
  }
  for (const { headword, value } of rows) {
    const row = kept.get(headword) ?? { headword }
    kept.set(headword, { ...row, [field]: value })
  }

  const tx = db.transaction(STORES.ranks, 'readwrite')
  const store = tx.objectStore(STORES.ranks)
  store.clear()
  for (const row of kept.values()) store.put(row)
  await done(tx)
}

/** Drops one kind of list, keeping whatever the other contributed. */
export async function deleteWordListIn(db: IDBDatabase, kind: ListKind): Promise<void> {
  await replaceWordListIn(db, kind, [])
}

/** headword → frequency rank, for ordering the review queue. */
export async function rankMapIn(db: IDBDatabase): Promise<Map<string, number>> {
  const rows = await request<Rank[]>(
    db.transaction(STORES.ranks, 'readonly').objectStore(STORES.ranks).getAll(),
  )
  const ranks = new Map<string, number>()
  for (const row of rows) {
    if (row.rank !== undefined) ranks.set(row.headword, row.rank)
  }
  return ranks
}

export interface WordListMeta {
  name: string
  count: number
  uploadedAt: number
}

const WORD_LIST_META_KEY = 'bbSubsgenWordLists'

/**
 * What is loaded, mirrored into extension storage.
 *
 * Kept beside the data rather than derived from it: "how many rows and from
 * which file" is not recoverable by counting a store two lists share.
 */
export async function wordListMeta(): Promise<Partial<Record<ListKind, WordListMeta>>> {
  const stored = await chrome.storage.local.get(WORD_LIST_META_KEY)
  return (stored[WORD_LIST_META_KEY] as Partial<Record<ListKind, WordListMeta>>) ?? {}
}

export async function setWordListMeta(kind: ListKind, meta: WordListMeta | null): Promise<void> {
  const all = await wordListMeta()
  if (meta) all[kind] = meta
  else delete all[kind]
  await chrome.storage.local.set({ [WORD_LIST_META_KEY]: all })
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
  words?: string[],
  patterns?: string[],
): Promise<void> {
  return captureSentenceIn(await flashcardsDb(), text, context, target, words, patterns)
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
  extra = false,
): Promise<Item> {
  const next = await applyReviewIn(await flashcardsDb(), item, grade, style, now, extra)
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

export async function replaceWordList(
  kind: ListKind,
  rows: Array<{ headword: string; value: number }>,
  meta: WordListMeta,
): Promise<void> {
  await replaceWordListIn(await flashcardsDb(), kind, rows)
  await setWordListMeta(kind, meta)
}

export async function deleteWordList(kind: ListKind): Promise<void> {
  await deleteWordListIn(await flashcardsDb(), kind)
  await setWordListMeta(kind, null)
}

export async function rankMap(): Promise<Map<string, number>> {
  return rankMapIn(await flashcardsDb())
}
