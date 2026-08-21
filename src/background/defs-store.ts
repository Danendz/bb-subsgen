// The CC-CEDICT definition store, owned exclusively by the service worker.
//
// This lives here rather than in a content script because content scripts get
// the *page's* IndexedDB origin, not the extension's. The reader runs on any
// site the user opts into, so a per-content-script store would re-import all
// 31MB of defs.json once per origin and keep a copy under each. In the worker
// the extension origin is the only origin, so the import happens once ever and
// every page shares it over `chrome.runtime.sendMessage`.

import type { CedictEntry } from '../lang/dict'

const DB_NAME = 'bb-subsgen'
const STORE_NAME = 'defs'
const DEFS_VERSION_KEY = 'bbSubsgenDefsVersion'
// Bumped from 1 when the store moved out of the page origin: the version flag
// lives in chrome.storage.local, which is extension-wide and therefore already
// said "1" while the worker's own database was still empty.
const CURRENT_DEFS_VERSION = 2

// `dbName` is overridable so tests don't share state.
export function openDefsDb(dbName = DB_NAME): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName, 1)
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export function importDefs(db: IDBDatabase, defs: Record<string, CedictEntry[]>): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    for (const [headword, entries] of Object.entries(defs)) {
      store.put(entries, headword)
    }
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

/**
 * Looks up several headwords in a single transaction.
 *
 * Batching is what keeps the card's per-character breakdown to one round trip:
 * 学习 asks for `['学习', '学', '习']` together rather than three times over.
 * Headwords with no entry are present in the result with an empty array, so
 * callers never have to distinguish "missing" from "not looked up".
 */
export function lookupDefsIn(
  db: IDBDatabase,
  headwords: string[],
): Promise<Record<string, CedictEntry[]>> {
  return new Promise((resolve, reject) => {
    const found: Record<string, CedictEntry[]> = {}
    if (!headwords.length) {
      resolve(found)
      return
    }

    const store = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME)
    // Deduplicated: 一一 would otherwise issue the same get twice.
    for (const headword of new Set(headwords)) {
      const req = store.get(headword)
      req.onsuccess = () => {
        found[headword] = req.result ?? []
      }
    }

    const tx = store.transaction
    tx.oncomplete = () => resolve(found)
    tx.onerror = () => reject(tx.error)
  })
}

/** Imports defs.json once (gated by a version flag in extension storage). */
export async function ensureDefsImported(db: IDBDatabase): Promise<void> {
  const { [DEFS_VERSION_KEY]: version } = await chrome.storage.local.get(DEFS_VERSION_KEY)
  if (version === CURRENT_DEFS_VERSION) return

  const url = chrome.runtime.getURL('dict/defs.json')
  const defs = await fetch(url).then((r) => r.json())
  await importDefs(db, defs)
  await chrome.storage.local.set({ [DEFS_VERSION_KEY]: CURRENT_DEFS_VERSION })
}

// Memoized, not eager: the worker is torn down whenever it goes idle and woken
// by the next lookup, so this resolves once per worker lifetime. The import
// itself is gated separately and only ever runs on the very first wake.
let ready: Promise<IDBDatabase> | null = null

export function defsDb(): Promise<IDBDatabase> {
  if (!ready) {
    ready = (async () => {
      const db = await openDefsDb()
      await ensureDefsImported(db)
      return db
    })().catch((e) => {
      // Don't cache a failed open, or one transient error poisons the worker
      // until the browser restarts.
      ready = null
      throw e
    })
  }
  return ready
}

export async function lookupDefs(headwords: string[]): Promise<Record<string, CedictEntry[]>> {
  return lookupDefsIn(await defsDb(), headwords)
}
