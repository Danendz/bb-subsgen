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
const VERSION = 1

export const STORES = {
  items: 'items',
  reviews: 'reviews',
  exposures: 'exposures',
  videoWords: 'videoWords',
  videos: 'videos',
  signals: 'signals',
  ranks: 'ranks',
} as const

/** Promise-wraps a request. */
export function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

/**
 * Read-modify-write within a live transaction.
 *
 * The `put` is issued synchronously inside the `get`'s success handler, which
 * is the only reliable way to keep an IndexedDB transaction alive across a
 * read. Awaiting the read first — or chaining off a promise — hands control
 * back to the microtask queue, and the transaction may auto-commit before the
 * write is ever issued.
 */
export function upsert<T>(
  store: IDBObjectStore,
  key: IDBValidKey,
  update: (existing: T | undefined) => T,
): void {
  const req = store.get(key)
  req.onsuccess = () => store.put(update(req.result as T | undefined))
}

/** Resolves when the transaction commits, so callers can fire several writes then await once. */
export function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

/** `dbName` is overridable so tests don't share state. */
export function openFlashcardsDb(dbName = DB_NAME): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName, VERSION)

    req.onupgradeneeded = () => {
      const db = req.result

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
        keyPath: ['bvid', 'headword'],
      })
      videoWords.createIndex('by-video', 'bvid')

      db.createObjectStore(STORES.videos, { keyPath: 'bvid' })

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
