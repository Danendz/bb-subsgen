// The dictionary database: definitions, lexicon text, and per-language install
// state. Replaces background/defs-store.ts, which held only definitions, all
// Chinese, imported once from a build artifact.
//
// What a stored definition row *is* is deliberately not known here. Rows go in
// and come out as `DictRow`, and only the language's pack can read one — see
// `entriesFrom` in src/lang/pack.ts. Storing already-converted `Entry` records
// instead would bake the traditional/simplified choice and the prettified gloss
// text into the database, which would make flipping a display setting a
// re-install.
//
// Schema history:
// 1 — a single `defs` store keyed by bare headword, gated by a
//     `bbSubsgenDefsVersion` flag in chrome.storage.local rather than an IDB
//     version bump (see the deleted background/defs-store.ts for why).
// 2 — `defs` re-keyed as `` `${lang}:${headword}` `` so more than one language
//     can share the store, and `lexicons` / `meta` added so a whole lexicon and
//     its install record live beside the definitions they came from.
//     `onupgradeneeded` clears `defs` outright rather than rewriting keys in
//     place: the key shape changed, the data is re-derivable from a re-install
//     (see install.ts), and clearing also fixes a bug in the old code where a
//     re-import never removed a headword CC-CEDICT had since dropped.
// 3 — `glosses` added: definitions machine-translated out of the English the
//     dictionaries ship, keyed `` `${lang}:${headword}:${target}` ``. A new
//     store rather than a field on a `defs` row, because a row is opaque here
//     and only the language's pack may read one — and because the two have
//     different lifetimes: a re-install replaces `defs` wholesale, while a
//     translation of a headword that survived the re-install is still good.
//     Nothing is migrated: the store starts empty and fills on demand.
import type { DictRow } from '../lang/pack'
import { connection, done, request } from '../shared/idb'

const DB_NAME = 'bb-subsgen'
const VERSION = 3

export const STORES = {
  defs: 'defs',
  lexicons: 'lexicons',
  meta: 'meta',
  glosses: 'glosses',
} as const

export interface DictMeta {
  url: string
  lastModified: string | null
  installedAt: number
  entryCount: number
  formatVersion: number
}

/** `dbName` is overridable so tests don't share state. */
export function openDictDb(dbName = DB_NAME): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName, VERSION)
    req.onupgradeneeded = (event) => {
      const db = req.result
      if (event.oldVersion < 2) {
        if (db.objectStoreNames.contains(STORES.defs)) db.deleteObjectStore(STORES.defs)
        db.createObjectStore(STORES.defs)
        db.createObjectStore(STORES.lexicons)
        db.createObjectStore(STORES.meta)
      }
      // Steps run one after another rather than as one branch: a profile on
      // schema 1 has to get both, and an `else if` would leave it without a
      // `glosses` store that every read from here on assumes exists.
      if (event.oldVersion < 3) {
        db.createObjectStore(STORES.glosses)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function defsKeyRangeFor(lang: string): IDBKeyRange {
  // '￿' sorts after every headword a real dictionary key could produce,
  // so this bounds exactly the rows this language wrote.
  return IDBKeyRange.bound(`${lang}:`, `${lang}:￿`)
}

/** Deletes every `defs` row for a language, ahead of a fresh install. */
export function clearLangIn(db: IDBDatabase, lang: string): Promise<void> {
  const tx = db.transaction(STORES.defs, 'readwrite')
  tx.objectStore(STORES.defs).delete(defsKeyRangeFor(lang))
  return done(tx)
}

/** Writes one chunk of `headword -> rows` for a language, in one transaction. */
export function putDefsChunk(
  db: IDBDatabase,
  lang: string,
  entries: Map<string, DictRow[]>,
): Promise<void> {
  const tx = db.transaction(STORES.defs, 'readwrite')
  const store = tx.objectStore(STORES.defs)
  for (const [headword, defs] of entries) {
    store.put(defs, `${lang}:${headword}`)
  }
  return done(tx)
}

/**
 * Looks up several headwords for one language in a single transaction.
 *
 * Batching is what keeps the card's per-character breakdown to one round trip:
 * 学习 asks for `['学习', '学', '习']` together rather than three times over.
 * Headwords with no entry are present in the result with an empty array, so
 * callers never have to distinguish "missing" from "not looked up".
 */
export function lookupDefsIn(
  db: IDBDatabase,
  lang: string,
  headwords: string[],
): Promise<Record<string, DictRow[]>> {
  return new Promise((resolve, reject) => {
    const found: Record<string, DictRow[]> = {}
    if (!headwords.length) {
      resolve(found)
      return
    }

    const store = db.transaction(STORES.defs, 'readonly').objectStore(STORES.defs)
    // Deduplicated: 一一 would otherwise issue the same get twice.
    for (const headword of new Set(headwords)) {
      const req = store.get(`${lang}:${headword}`)
      req.onsuccess = () => {
        found[headword] = req.result ?? []
      }
    }

    const tx = store.transaction
    tx.oncomplete = () => resolve(found)
    tx.onerror = () => reject(tx.error)
  })
}

export function putLexicon(db: IDBDatabase, lang: string, text: string): Promise<void> {
  const tx = db.transaction(STORES.lexicons, 'readwrite')
  tx.objectStore(STORES.lexicons).put(text, lang)
  return done(tx)
}

export async function getLexiconIn(db: IDBDatabase, lang: string): Promise<string | null> {
  const store = db.transaction(STORES.lexicons, 'readonly').objectStore(STORES.lexicons)
  const text = await request<string | undefined>(store.get(lang))
  return text ?? null
}

/**
 * Written last, in its own transaction. Absence of `meta` is the definition of
 * "not installed" — see install.ts — so this is the one write that must never
 * race ahead of the data it describes.
 */
export function putMeta(db: IDBDatabase, lang: string, meta: DictMeta): Promise<void> {
  const tx = db.transaction(STORES.meta, 'readwrite')
  tx.objectStore(STORES.meta).put(meta, lang)
  return done(tx)
}

export async function getMetaIn(db: IDBDatabase, lang: string): Promise<DictMeta | null> {
  const store = db.transaction(STORES.meta, 'readonly').objectStore(STORES.meta)
  const meta = await request<DictMeta | undefined>(store.get(lang))
  return meta ?? null
}

/** Every language's install record, keyed by `lang`. What the badge and the popup ask for. */
export async function getAllMeta(db: IDBDatabase): Promise<Record<string, DictMeta>> {
  const store = db.transaction(STORES.meta, 'readonly').objectStore(STORES.meta)
  const [keys, values] = await Promise.all([
    request<IDBValidKey[]>(store.getAllKeys()),
    request<DictMeta[]>(store.getAll()),
  ])
  return Object.fromEntries(keys.map((key, i) => [key as string, values[i]]))
}

/**
 * A definition as it is shown, once translated out of English.
 *
 * The senses are held as a list in the order the pack ranked them, not as one
 * joined string: the hover card shows the first few and the review reveal shows
 * one, and rejoining a string it had already split is how the separator ends up
 * translated along with the text.
 */
export interface GlossTranslation {
  senses: string[]
  /** When it was written, so a stale cache can be recognised without a version. */
  at: number
}

/**
 * Keyed by all three of study language, headword and target.
 *
 * The target is part of the key rather than a separate store per language
 * because it is the thing that changes: a learner switching from English to
 * Spanish keeps every Spanish row already written and re-translates nothing on
 * switching back.
 */
function glossKey(lang: string, headword: string, target: string): string {
  return `${lang}:${headword}:${target}`
}

export function putGlossesIn(
  db: IDBDatabase,
  lang: string,
  target: string,
  entries: Map<string, string[]>,
): Promise<void> {
  const tx = db.transaction(STORES.glosses, 'readwrite')
  const store = tx.objectStore(STORES.glosses)
  const at = Date.now()
  for (const [headword, senses] of entries) {
    store.put({ senses, at } satisfies GlossTranslation, glossKey(lang, headword, target))
  }
  return done(tx)
}

/**
 * Looks up several headwords' translated senses in one transaction.
 *
 * Shaped like `lookupDefsIn` on purpose — the same call site asks both, and a
 * headword with no translation yet is absent from the result rather than
 * present and empty, because "not translated" and "translated to nothing" have
 * to be told apart here.
 */
export function lookupGlossesIn(
  db: IDBDatabase,
  lang: string,
  target: string,
  headwords: string[],
): Promise<Record<string, string[]>> {
  return new Promise((resolve, reject) => {
    const found: Record<string, string[]> = {}
    if (!headwords.length) {
      resolve(found)
      return
    }

    const store = db.transaction(STORES.glosses, 'readonly').objectStore(STORES.glosses)
    for (const headword of new Set(headwords)) {
      const req = store.get(glossKey(lang, headword, target))
      req.onsuccess = () => {
        const row = req.result as GlossTranslation | undefined
        if (row) found[headword] = row.senses
      }
    }

    const tx = store.transaction
    tx.oncomplete = () => resolve(found)
    tx.onerror = () => reject(tx.error)
  })
}

/**
 * Drops every translated gloss for a language, ahead of a fresh install.
 *
 * Across all targets, not just the current one: the headwords themselves have
 * changed, so a translation keyed to one that the new dictionary dropped is
 * pointing at a definition that no longer exists.
 */
export function clearGlossesIn(db: IDBDatabase, lang: string): Promise<void> {
  const tx = db.transaction(STORES.glosses, 'readwrite')
  tx.objectStore(STORES.glosses).delete(IDBKeyRange.bound(`${lang}:`, `${lang}:￿`))
  return done(tx)
}

// Memoized, not eager: the worker is torn down whenever it goes idle and woken
// by the next lookup, so this resolves once per worker lifetime. `connection`
// also drops the memo when the connection dies — see src/shared/idb.ts, which
// explains why that matters most to this database in particular.
export const dictDb = connection(() => openDictDb())

/** Convenience for callers that already have a language and no database handle. */
export async function lookupDefs(
  lang: string,
  headwords: string[],
): Promise<Record<string, DictRow[]>> {
  return lookupDefsIn(await dictDb(), lang, headwords)
}
