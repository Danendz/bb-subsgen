// The flashcards database.
//
// Deliberately separate from the `bb-subsgen` defs database next door. That one
// is a disposable cache — re-importable from defs.json whenever it's missing or
// stale — while this one holds study history that cannot be reconstructed from
// anything. Sharing a database would put irreplaceable data behind a schema
// migration whose current failure mode is "delete it and re-import".
//
// Only the service worker and the study app can open this: both run on the
// extension origin. Content scripts get the *page's* origin (the same reason
// defs-store.ts lives in the worker), so they go through messages instead.

import { connection, request } from '../shared/idb'
import { snapshotIfOutdated, type DeckRows } from './snapshot'
import {
  namespaceLegacyId,
  type Exposure,
  type Item,
  type Review,
  type Video,
  type VideoWord,
} from './types'

const DB_NAME = 'bb-subsgen-flashcards'

/**
 * 1 — the original schema.
 * 2 — words no longer wait in the intake pool, so the ones already there are
 *     released. See `releasePooledWords`.
 * 3 — `bvid` becomes `videoId`, because bangumi episodes have no BV id. See
 *     `renameBvidToVideoId`.
 * 4 — every key learns which language it is in. Card ids gain a segment
 *     (`w:zh:生`), cards gain a `lang` field, and the three headword-keyed
 *     stores move to composite key paths. See `namespaceByLanguage`. The
 *     pre-upgrade deck is exported to `bb-subsgen-flashcards-snapshots` first —
 *     see snapshot.ts, which cannot happen inside this transaction because an
 *     IDB transaction is scoped to one database.
 */
const VERSION = 4

/**
 * The language every row that predates schema 4 is in.
 *
 * A literal rather than a read of `chrome.storage`: a versionchange transaction
 * auto-commits at the end of the microtask turn, so there is no awaiting
 * anything from in here — and there is nothing to ask anyway. Chinese was the
 * only pack that existed when these rows were written.
 */
const LEGACY_LANG = 'zh'

export const STORES = {
  items: 'items',
  reviews: 'reviews',
  exposures: 'exposures',
  videoWords: 'videoWords',
  videos: 'videos',
  signals: 'signals',
  ranks: 'ranks',
} as const

/**
 * Runs migration steps one after another inside a versionchange transaction.
 *
 * Sequencing is not a nicety here, it is the whole reason this exists. Two
 * version bumps can touch the same store, and a database three versions behind
 * runs both in one transaction: v3 reads `videoWords`, drops it and recreates it
 * under a new key, and v4 does the same thing again. Issue both reads up front
 * and the second one is against a store the first is about to delete — which
 * aborts the transaction, and with it the whole upgrade.
 *
 * The same ordering hazard is quieter for the cursor walks: a `getAll` issued
 * beside a running cursor is served before the cursor's later `continue`s, so
 * the v4 rewrite would read rows the v3 walk had not finished editing and then
 * `clear()` away the edits it did make.
 *
 * Each step calls `next` from inside a request's success handler, which is also
 * what keeps the transaction alive — see `upsert` in shared/idb.ts for the same
 * rule stated the other way round.
 */
function sequence(steps: Array<(next: () => void) => void>): void {
  const run = (i: number) => {
    if (i < steps.length) steps[i](() => run(i + 1))
  }
  run(0)
}

/**
 * Frees the words that were collected while the intake pool still held them.
 *
 * Nothing else about the row changes — not the id, not the contexts, not a
 * review. This database holds history that cannot be rebuilt from anything (see
 * the note at the top of this file), so a migration here edits one field on the
 * rows that need it and leaves every other row untouched.
 *
 * Sentences keep their pool, so this is deliberately narrower than "everything
 * pooled": it must not release the lines.
 */
function releasePooledWords(items: IDBObjectStore, next: () => void): void {
  const cursor = items.openCursor()
  cursor.onsuccess = () => {
    const at = cursor.result
    if (!at) return next()

    const item = at.value as { kind: string; state: string }
    if (item.kind === 'word' && item.state === 'pool') {
      at.update({ ...item, state: 'new' })
    }
    at.continue()
  }
}

/**
 * Renames the stored `bvid` field to `videoId`, everywhere it appears.
 *
 * Bangumi episodes have no BV id — their identity is `ep335910` — so the field
 * had to start meaning "whatever identifies this video" rather than "Bilibili's
 * BV id". The name was the only thing standing in the way.
 *
 * Two of these stores key on it, and IndexedDB cannot alter a keyPath: the only
 * way through is to read every row out, drop the store, recreate it under the
 * new key and write the rows back. That is as alarming as it sounds, which is
 * why it happens inside the upgrade transaction — it either completes or the
 * whole version bump rolls back, and there is no state in which half the deck
 * has moved.
 */
function renameBvidToVideoId(db: IDBDatabase, tx: IDBTransaction, next: () => void): void {
  sequence([
    (step) =>
      rekeyOnVideoId(
        db,
        tx,
        STORES.videoWords,
        (fresh) => {
          const store = fresh.createObjectStore(STORES.videoWords, {
            keyPath: ['videoId', 'headword'],
          })
          store.createIndex('by-video', 'videoId')
          return store
        },
        step,
      ),
    (step) =>
      rekeyOnVideoId(
        db,
        tx,
        STORES.videos,
        (fresh) => fresh.createObjectStore(STORES.videos, { keyPath: 'videoId' }),
        step,
      ),
    // Not keyed on it, so these two are ordinary field edits — a cursor walk that
    // touches only the rows that carry the old name.
    (step) => renameInContexts(tx.objectStore(STORES.items), step),
    (step) => renameFieldInPlace(tx.objectStore(STORES.signals), step),
    (_step) => next(),
  ])
}

/**
 * Moves a store to a `videoId` key, carrying its rows across.
 *
 * The rows are read before the store is dropped and written back into its
 * replacement, all within the one transaction. `recreate` is a callback rather
 * than a keyPath because the two stores differ in whether they carry an index.
 */
function rekeyOnVideoId(
  db: IDBDatabase,
  tx: IDBTransaction,
  name: string,
  recreate: (db: IDBDatabase) => IDBObjectStore,
  next: () => void,
): void {
  const rows = tx.objectStore(name).getAll()
  rows.onsuccess = () => {
    db.deleteObjectStore(name)
    const store = recreate(db)
    for (const row of rows.result as Array<Record<string, unknown>>) {
      const { bvid, ...rest } = row
      store.put({ ...rest, videoId: bvid })
    }
    next()
  }
}

/** Renames the field inside every `Context` an item carries. */
function renameInContexts(items: IDBObjectStore, next: () => void): void {
  const cursor = items.openCursor()
  cursor.onsuccess = () => {
    const at = cursor.result
    if (!at) return next()

    const item = at.value as { contexts?: Array<Record<string, unknown>> }
    if (item.contexts?.some((context) => 'bvid' in context)) {
      at.update({
        ...item,
        contexts: item.contexts.map(({ bvid, ...rest }) =>
          bvid === undefined ? rest : { ...rest, videoId: bvid },
        ),
      })
    }
    at.continue()
  }
}

/** Renames the field on rows that carry it at the top level. */
function renameFieldInPlace(store: IDBObjectStore, next: () => void): void {
  const cursor = store.openCursor()
  cursor.onsuccess = () => {
    const at = cursor.result
    if (!at) return next()

    const row = at.value as Record<string, unknown>
    if ('bvid' in row) {
      const { bvid, ...rest } = row
      at.update(bvid === undefined ? rest : { ...rest, videoId: bvid })
    }
    at.continue()
  }
}

/**
 * Teaches every key in the deck which language it is in.
 *
 * A headword without a language is ambiguous the moment a second pack ships:
 * Chinese 生 and Japanese 生 are the same string and different words, and before
 * this they were one card sharing one exposure count and one HSK rank.
 *
 * Four of the five changes are key changes, and IndexedDB cannot alter a
 * keyPath — so `items` is read out, cleared and written back under new ids, and
 * the three headword-keyed stores go through the same read-drop-recreate-rewrite
 * dance `renameBvidToVideoId` already established. `reviews` is the exception:
 * its `itemId` is an ordinary field, so a cursor walk repoints it and `seq` —
 * the autoIncrement key the log is ordered by — is never touched.
 *
 * Every step below is callback-based rather than `async`. An `await` between a
 * read and its write-back hands control to the microtask queue, the versionchange
 * transaction auto-commits, and the rows are gone.
 *
 * `videos` and `signals` are not language-scoped and are left alone.
 */
function namespaceByLanguage(db: IDBDatabase, tx: IDBTransaction, next: () => void): void {
  sequence([
    (step) => namespaceItems(tx.objectStore(STORES.items), step),
    (step) => repointReviews(tx.objectStore(STORES.reviews), step),
    (step) =>
      rekey(
        db,
        tx,
        STORES.exposures,
        (fresh) => fresh.createObjectStore(STORES.exposures, { keyPath: ['lang', 'headword'] }),
        step,
      ),
    (step) =>
      rekey(
        db,
        tx,
        STORES.videoWords,
        (fresh) => {
          const store = fresh.createObjectStore(STORES.videoWords, {
            keyPath: ['videoId', 'lang', 'headword'],
          })
          // Recreated with the store. `videoWords()` queries nothing else, so
          // dropping it here would leave every per-video lookup silently
          // returning nothing.
          store.createIndex('by-video', 'videoId')
          return store
        },
        step,
      ),
    (step) =>
      rekey(
        db,
        tx,
        STORES.ranks,
        (fresh) => {
          const store = fresh.createObjectStore(STORES.ranks, { keyPath: ['lang', 'headword'] })
          store.createIndex('by-rank', 'rank')
          return store
        },
        step,
      ),
    (_step) => next(),
  ])
}

/**
 * Rewrites every card under a namespaced id, carrying the row across otherwise
 * untouched.
 *
 * `items` keys on `id` and the id itself is what changes, so a cursor `update`
 * is not available — it cannot move a row to a new key. The store is read whole,
 * cleared and written back, all inside the one transaction.
 *
 * The new id comes from `namespaceLegacyId`, which is also what the version-3
 * backup lift uses — the two have to agree exactly, or a re-imported snapshot
 * would land beside the migrated cards instead of on top of them.
 */
function namespaceItems(items: IDBObjectStore, next: () => void): void {
  const rows = items.getAll()
  rows.onsuccess = () => {
    items.clear()
    for (const row of rows.result as Item[]) {
      items.put({ ...row, lang: LEGACY_LANG, id: namespaceLegacyId(LEGACY_LANG, row.id) })
    }
    next()
  }
}

/**
 * Points every logged review at its card's new id.
 *
 * The review log is the irreplaceable half of this database — the schedule is
 * derived from it by `replay`, so an orphaned `itemId` does not lose a row, it
 * loses the history behind a card. A value-only edit, so this is a cursor walk
 * and `seq` never moves.
 */
function repointReviews(reviews: IDBObjectStore, next: () => void): void {
  const cursor = reviews.openCursor()
  cursor.onsuccess = () => {
    const at = cursor.result
    if (!at) return next()

    const review = at.value as Review
    at.update({ ...review, itemId: namespaceLegacyId(LEGACY_LANG, review.itemId) })
    at.continue()
  }
}

/**
 * Moves a store to a new key path, carrying its rows across under `LEGACY_LANG`.
 *
 * Same shape as `rekeyOnVideoId` above and for the same reason: read before the
 * drop, write into the replacement, all in the one transaction. `recreate` is a
 * callback because the three stores differ in which indexes they carry.
 */
function rekey(
  db: IDBDatabase,
  tx: IDBTransaction,
  name: string,
  recreate: (db: IDBDatabase) => IDBObjectStore,
  next: () => void,
): void {
  const rows = tx.objectStore(name).getAll()
  rows.onsuccess = () => {
    db.deleteObjectStore(name)
    const store = recreate(db)
    for (const row of rows.result as Array<Record<string, unknown>>) {
      store.put({ ...row, lang: LEGACY_LANG })
    }
    next()
  }
}

/** `dbName` is overridable so tests don't share state. */
export function openFlashcardsDb(dbName = DB_NAME): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName, VERSION)

    req.onupgradeneeded = (event) => {
      const db = req.result

      if (event.oldVersion >= 1) {
        // An existing database: the stores are already there, and the only work
        // is whatever each version bump owes. Run in order, one after the other
        // — see `sequence` for why they cannot all be started at once.
        const tx = req.transaction!
        const steps: Array<(next: () => void) => void> = []
        if (event.oldVersion < 2) {
          steps.push((next) => releasePooledWords(tx.objectStore(STORES.items), next))
        }
        if (event.oldVersion < 3) {
          steps.push((next) => renameBvidToVideoId(db, tx, next))
        }
        if (event.oldVersion < 4) {
          steps.push((next) => namespaceByLanguage(db, tx, next))
        }
        sequence(steps)
        return
      }

      const items = db.createObjectStore(STORES.items, { keyPath: 'id' })
      items.createIndex('by-state', 'state')
      items.createIndex('by-due', 'due')
      items.createIndex('by-kind', 'kind')
      // Intake ordering scans this directly rather than joining every pooled
      // candidate against `ranks`.
      items.createIndex('by-state-rank', ['state', 'rank'])

      const reviews = db.createObjectStore(STORES.reviews, {
        keyPath: 'seq',
        autoIncrement: true,
      })
      reviews.createIndex('by-item', 'itemId')
      // Import merging walks the whole log in timestamp order.
      reviews.createIndex('by-at', 'at')

      db.createObjectStore(STORES.exposures, { keyPath: ['lang', 'headword'] })

      const videoWords = db.createObjectStore(STORES.videoWords, {
        keyPath: ['videoId', 'lang', 'headword'],
      })
      videoWords.createIndex('by-video', 'videoId')

      db.createObjectStore(STORES.videos, { keyPath: 'videoId' })

      const signals = db.createObjectStore(STORES.signals, {
        keyPath: 'seq',
        autoIncrement: true,
      })
      signals.createIndex('by-at', 'at')

      const ranks = db.createObjectStore(STORES.ranks, { keyPath: ['lang', 'headword'] })
      ranks.createIndex('by-rank', 'rank')
    }

    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

/**
 * Every store a backup carries, read whole.
 *
 * Here rather than beside `exportBackupIn` because the pre-upgrade snapshot
 * needs the same read against a connection opened at the *old* schema, and
 * snapshot.ts cannot import this module — this module imports it. Nothing here
 * reads a key path, so it works at any version.
 *
 * `seq` is dropped from the reviews: it is an autoIncrement key belonging to
 * *this* database and means nothing in another one, so carrying it would collide
 * on import.
 */
export async function readAllRows(db: IDBDatabase): Promise<DeckRows> {
  const read = <T>(store: string) =>
    request<T[]>(db.transaction(store, 'readonly').objectStore(store).getAll())

  const [items, reviews, exposures, videoWords, videos] = await Promise.all([
    read<Item>(STORES.items),
    read<Review>(STORES.reviews),
    read<Exposure>(STORES.exposures),
    read<VideoWord>(STORES.videoWords),
    read<Video>(STORES.videos),
  ])

  return {
    items,
    reviews: reviews.map(({ itemId, at, grade, style, intervalBefore, intervalAfter, extra }) => ({
      itemId,
      at,
      grade,
      style,
      intervalBefore,
      intervalAfter,
      ...(extra ? { extra: true as const } : {}),
    })),
    exposures,
    videoWords,
    videos,
  }
}

// Memoized for the same reason as dictDb(): the worker is torn down whenever it
// goes idle, so this resolves once per worker lifetime.
//
// The snapshot goes in front of the open rather than beside one caller of it, so
// every entry point — the worker, the study app, the popup — takes a copy of the
// deck before whichever of them happens to be first triggers the migration.
export const flashcardsDb = connection(async () => {
  await snapshotIfOutdated(DB_NAME, VERSION, readAllRows)
  return openFlashcardsDb()
})
