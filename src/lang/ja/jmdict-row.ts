// What one JMdict entry looks like once it is in the store, and how to tell
// that a row actually is one.
//
// The Japanese counterpart of `zh/cedict-row.ts`, and here for the same reason:
// this is one language's private dictionary format, written only by the install
// in `src/dict/` and read only by `entriesFrom` in `entries.ts`. `DictRow` is
// `unknown` precisely so that neither shape has to be named on the interface
// every language implements — JMdict has no `simplified`, no `traditional` and
// no pinyin string, and CC-CEDICT has none of the three fields below.
//
// The guard is hand-written for the same reason: a row comes back out of
// IndexedDB written by whichever install ran last, and a cast would turn a
// stale row into an exception inside a hover card rather than a card with no
// definition on it.
//
// Trimmed, not copied whole. JMdict carries cross-references, dialect marks,
// per-gloss types and language-of-origin notes that nothing here reads; the
// fields kept are the ones the card, the ranking, the furigana and #15's
// deinflection actually ask for. The whole file trimmed to these is ~35MB of
// row JSON, against 63MB of XML.

/** One way the word is written in kanji. */
export interface JmdictKanji {
  text: string
  /**
   * Whether this spelling carries a top-band priority marker.
   *
   * One boolean rather than the raw `ke_pri` bands, resolved at parse time:
   * every caller asks "is this the ordinary way to write it", and nothing has
   * ever needed to know that a word is `news2` rather than `nf21`.
   */
  common: boolean
  /** `ke_inf` codes, entity refs stripped — `rK`, `oK`, `iK`. */
  tags: string[]
}

/** One way the word is read. */
export interface JmdictKana {
  text: string
  common: boolean
  /** `re_inf` codes, entity refs stripped — `ok`, `rk`, `sk`. */
  tags: string[]
  /**
   * The kanji spellings this reading belongs to. Empty means all of them.
   *
   * `re_restr`, and what stops a reading being drawn over a spelling it is not
   * a reading of: 幸せ is しあわせ and 幸い is さいわい, one entry, and without
   * the restriction the furigana over 幸 is a coin toss. A bug that is
   * invisible until a Japanese page renders.
   */
  restrictedTo: string[]
  /**
   * `re_nokanji`: a reading that belongs to none of the spellings.
   *
   * Distinct from an empty `restrictedTo`, which means "all of them". Usually a
   * katakana form of a word normally written in kanji.
   */
  nokanji: boolean
}

/** One meaning, with the JMdict codes that classify it. */
export interface JmdictSense {
  /** Part of speech, entity refs stripped — `n`, `v5r`, `adj-i`. */
  pos: string[]
  /** `misc`: `arch`, `obs`, `rare`, `surname`, `place`, `uk`. */
  misc: string[]
  /** `field`: `med`, `comp`, `ling`. */
  field: string[]
  /** `s_inf`: a free-text usage note. */
  info: string[]
  /** The English glosses, in JMdict's order — the first is the primary sense. */
  gloss: string[]
}

export interface JmdictRow {
  kanji: JmdictKanji[]
  kana: JmdictKana[]
  senses: JmdictSense[]
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function isKanji(value: unknown): value is JmdictKanji {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Partial<Record<keyof JmdictKanji, unknown>>
  return (
    typeof candidate.text === 'string' &&
    typeof candidate.common === 'boolean' &&
    isStringArray(candidate.tags)
  )
}

function isKana(value: unknown): value is JmdictKana {
  if (!isKanji(value)) return false
  const candidate = value as Partial<Record<keyof JmdictKana, unknown>>
  return isStringArray(candidate.restrictedTo) && typeof candidate.nokanji === 'boolean'
}

function isSense(value: unknown): value is JmdictSense {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Partial<Record<keyof JmdictSense, unknown>>
  return (
    isStringArray(candidate.pos) &&
    isStringArray(candidate.misc) &&
    isStringArray(candidate.field) &&
    isStringArray(candidate.info) &&
    isStringArray(candidate.gloss)
  )
}

export function isJmdictRow(row: unknown): row is JmdictRow {
  if (typeof row !== 'object' || row === null) return false
  const candidate = row as Partial<Record<keyof JmdictRow, unknown>>
  return (
    Array.isArray(candidate.kanji) &&
    candidate.kanji.every(isKanji) &&
    Array.isArray(candidate.kana) &&
    candidate.kana.every(isKana) &&
    Array.isArray(candidate.senses) &&
    candidate.senses.every(isSense)
  )
}
