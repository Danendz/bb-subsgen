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

const DB_NAME = 'bb-subsgen-flashcards'

/**
 * 1 — the original schema.
 * 2 — words no longer wait in the intake pool, so the ones already there are
 *     released. See `releasePooledWords`.
 * 3 — `bvid` becomes `videoId`, because bangumi episodes have no BV id. See
 *     `renameBvidToVideoId`.
 */
const VERSION = 3

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
function releasePooledWords(items: IDBObjectStore): void {
  const cursor = items.openCursor()
  cursor.onsuccess = () => {
    const at = cursor.result
    if (!at) return

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
function renameBvidToVideoId(db: IDBDatabase, tx: IDBTransaction): void {
  rekeyOnVideoId(db, tx, STORES.videoWords, (fresh) => {
    const store = fresh.createObjectStore(STORES.videoWords, {
      keyPath: ['videoId', 'headword'],
    })
    store.createIndex('by-video', 'videoId')
    return store
  })

  rekeyOnVideoId(db, tx, STORES.videos, (fresh) =>
    fresh.createObjectStore(STORES.videos, { keyPath: 'videoId' }),
  )

  // Not keyed on it, so these two are ordinary field edits — a cursor walk that
  // touches only the rows that carry the old name.
  renameInContexts(tx.objectStore(STORES.items))
  renameFieldInPlace(tx.objectStore(STORES.signals))
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
): void {
  const rows = tx.objectStore(name).getAll()
  rows.onsuccess = () => {
    db.deleteObjectStore(name)
    const store = recreate(db)
    for (const row of rows.result as Array<Record<string, unknown>>) {
      const { bvid, ...rest } = row
      store.put({ ...rest, videoId: bvid })
    }
  }
}

/** Renames the field inside every `Context` an item carries. */
function renameInContexts(items: IDBObjectStore): void {
  const cursor = items.openCursor()
  cursor.onsuccess = () => {
    const at = cursor.result
    if (!at) return

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
function renameFieldInPlace(store: IDBObjectStore): void {
  const cursor = store.openCursor()
  cursor.onsuccess = () => {
    const at = cursor.result
    if (!at) return

    const row = at.value as Record<string, unknown>
    if ('bvid' in row) {
      const { bvid, ...rest } = row
      at.update(bvid === undefined ? rest : { ...rest, videoId: bvid })
    }
    at.continue()
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
        // is whatever each version bump owes.
        if (event.oldVersion < 2) {
          releasePooledWords(req.transaction!.objectStore(STORES.items))
        }
        if (event.oldVersion < 3) {
          renameBvidToVideoId(db, req.transaction!)
        }
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

      db.createObjectStore(STORES.exposures, { keyPath: 'headword' })

      const videoWords = db.createObjectStore(STORES.videoWords, {
        keyPath: ['videoId', 'headword'],
      })
      videoWords.createIndex('by-video', 'videoId')

      db.createObjectStore(STORES.videos, { keyPath: 'videoId' })

      const signals = db.createObjectStore(STORES.signals, {
        keyPath: 'seq',
        autoIncrement: true,
      })
      signals.createIndex('by-at', 'at')

      const ranks = db.createObjectStore(STORES.ranks, { keyPath: 'headword' })
      ranks.createIndex('by-rank', 'rank')
    }

    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

// Memoized for the same reason as defsDb(): the worker is torn down whenever it
// goes idle, so this resolves once per worker lifetime.
let ready: Promise<IDBDatabase> | null = null

export function flashcardsDb(): Promise<IDBDatabase> {
  if (!ready) {
    ready = openFlashcardsDb().catch((e) => {
      // Never cache a failed open, or one transient error poisons the worker.
      ready = null
      throw e
    })
  }
  return ready
}
