// Turning a downloaded payload into the rows the store takes.
//
// The seam `src/dict/parsers.ts` is for dictionaries: `wordlist-sources.ts`
// says what exists, this says how to read it, and only `wordlist-install.ts`
// imports this. Kept apart from `wordlist.ts` because that module sniffs an
// unknown user file and this one knows exactly what it fetched — a pinned
// commit needs no format detection, and running one through the other would
// mean re-guessing a shape we already have.
//
// Pure, so the awkward parts of a real payload are testable without a network.

import type { ListKind } from './wordlist'

export interface WordListRow {
  headword: string
  /** A rank for a frequency list, or the level for an HSK one. */
  value: number
}

export type WordListReader = (raw: string, kind: ListKind) => WordListRow[]

/**
 * One entry of `complete.min.json`, in its minified key names.
 *
 * `s` simplified, `l` the level tags, `q` the frequency rank. The file also
 * carries `f`, `p` and `r` — forms, parts of speech, radical — which duplicate
 * what CC-CEDICT already gave us, so they are read by nothing here.
 */
interface Hsk30Entry {
  s: string
  l: string[]
  q: number
}

/**
 * The value `q` carries for a word the frequency corpus never saw.
 *
 * 93 of the 11,470 entries have it. Left in, they sort to the end and claim
 * ranks like any other word, so the deck would introduce them as if they were
 * merely uncommon rather than unmeasured.
 */
const NO_FREQUENCY = 1_000_000

/** HSK 3.0 level tags are `n1`-`n7`; `o*` is HSK 2.0 and `t*` a third scheme. */
const NEW_HSK_TAG = /^n([1-9])$/

/**
 * Rows a payload read out of the network wrote, so the shape is checked rather
 * than asserted — the same reason `src/lang/zh/cedict-row.ts` guards by hand.
 */
function isHsk30Entry(value: unknown): value is Hsk30Entry {
  if (typeof value !== 'object' || value === null) return false
  const entry = value as { s?: unknown; l?: unknown; q?: unknown }
  return (
    typeof entry.s === 'string' &&
    entry.s.length > 0 &&
    Array.isArray(entry.l) &&
    typeof entry.q === 'number'
  )
}

function hsk30(raw: string, kind: ListKind): WordListRow[] {
  const parsed: unknown = JSON.parse(raw)
  if (!Array.isArray(parsed)) throw new Error('word list is not a JSON array')
  const entries = parsed.filter(isHsk30Entry)

  if (kind === 'frequency') {
    // Re-ranked by position rather than kept as `q`, which is a raw SUBTLEX-CH
    // rank: it has gaps, and 11,377 words share only 9,113 distinct values. Used
    // as-is it would tell the discovered bar there are a million words to learn.
    // This is the same rule `byPosition` applies to an uploaded file.
    return entries
      .filter((entry) => entry.q < NO_FREQUENCY)
      .sort((a, b) => a.q - b.q)
      .map((entry, index) => ({ headword: entry.s, value: index + 1 }))
  }

  // The lowest band a word appears in, which is the one it is first taught at.
  // An entry tagged only `o*` or `t*` is in the file for the other two HSK
  // schemes and has no 3.0 level to report.
  const rows: WordListRow[] = []
  for (const entry of entries) {
    let level = 0
    for (const tag of entry.l) {
      const match = typeof tag === 'string' ? NEW_HSK_TAG.exec(tag) : null
      if (!match) continue
      const band = Number(match[1])
      if (level === 0 || band < level) level = band
    }
    if (level > 0) rows.push({ headword: entry.s, value: level })
  }
  return rows
}

const READERS: Record<string, WordListReader> = { 'hsk30-frequency': hsk30, hsk30 }

export function readerFor(id: string): WordListReader | null {
  return READERS[id] ?? null
}
