/** Parses the `words.bin` build artifact (tab-separated `headword\tpinyin` lines) into a Map. */
export function parseWords(raw: string): Map<string, string> {
  const words = new Map<string, string>()
  for (const line of raw.split('\n')) {
    if (!line) continue
    const tab = line.indexOf('\t')
    if (tab === -1) continue
    words.set(line.slice(0, tab), line.slice(tab + 1))
  }
  return words
}

export async function loadWords(): Promise<Map<string, string>> {
  const url = chrome.runtime.getURL('dict/words.bin')
  const raw = await fetch(url).then((r) => r.text())
  return parseWords(raw)
}

export interface CedictEntry {
  simplified: string
  traditional: string
  pinyin: string
  definitions: string[]
}

const DB_NAME = 'bb-subsgen'
const STORE_NAME = 'defs'
const DEFS_VERSION_KEY = 'bbSubsgenDefsVersion'
const CURRENT_DEFS_VERSION = 1

// Content scripts share the page's origin for IndexedDB (not the extension's),
// so this store lives under bilibili.com — fine, since v1 targets only that
// one origin. `dbName` is overridable so tests don't share state.
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

export function importDefs(
  db: IDBDatabase,
  defs: Record<string, CedictEntry[]>,
): Promise<void> {
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

export function lookupDefsIn(db: IDBDatabase, headword: string): Promise<CedictEntry[]> {
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(headword)
    req.onsuccess = () => resolve(req.result ?? [])
    req.onerror = () => reject(req.error)
  })
}

/** Imports defs.json into IndexedDB once (gated by a version flag), then returns a lookup fn. */
export async function initDefs(): Promise<(headword: string) => Promise<CedictEntry[]>> {
  const db = await openDefsDb()

  const { [DEFS_VERSION_KEY]: version } = await chrome.storage.local.get(DEFS_VERSION_KEY)
  if (version !== CURRENT_DEFS_VERSION) {
    const url = chrome.runtime.getURL('dict/defs.json')
    const defs = await fetch(url).then((r) => r.json())
    await importDefs(db, defs)
    await chrome.storage.local.set({ [DEFS_VERSION_KEY]: CURRENT_DEFS_VERSION })
  }

  return (headword: string) => lookupDefsIn(db, headword)
}
