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
 */
const VERSION = 2

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
