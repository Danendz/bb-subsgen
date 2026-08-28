// What one CC-CEDICT line looks like once it is in the store, and how to tell
// that a row actually is one.
//
// The shape lived in `src/dict/cedict.ts` and was named on `LanguagePack`, so
// every renderer in the extension held a record with `simplified`, `pinyin` and
// unparsed `definitions` on it. It belongs here instead: it is the private
// format of one language's dictionary, read only by `entriesFrom` in
// `entries.ts` and written only by the install in `src/dict/`.
//
// The guard is hand-written for the same reason the message guards in
// `src/shared/messages.ts` are. A row arrives from IndexedDB typed `DictRow`,
// which is `unknown` — it was written by whatever version of the install ran
// last, possibly months ago, and a cast would turn a stale row into an
// exception inside a hover card rather than a card with no definition on it.

export interface CedictRow {
  simplified: string
  traditional: string
  pinyin: string
  definitions: string[]
}

export function isCedictRow(row: unknown): row is CedictRow {
  if (typeof row !== 'object' || row === null) return false
  const candidate = row as Partial<Record<keyof CedictRow, unknown>>
  return (
    typeof candidate.simplified === 'string' &&
    typeof candidate.traditional === 'string' &&
    typeof candidate.pinyin === 'string' &&
    Array.isArray(candidate.definitions) &&
    candidate.definitions.every((definition) => typeof definition === 'string')
  )
}
