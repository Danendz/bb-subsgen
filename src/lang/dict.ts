/**
 * The dictionary as segmentation and rendering need it.
 *
 * `words` is every headword CC-CEDICT knows, so lookup and dictionary search see
 * the whole file. `phrases` is the subset that must never claim a span of
 * characters — see `isPhrase` in entries.ts. Kept apart rather than filtered out
 * because a phrasebook entry is still a real thing to look up; it is only a bad
 * thing to *find* while cutting a sentence into words.
 */
export interface Lexicon {
  words: Map<string, string>
  phrases: ReadonlySet<string>
}

export const EMPTY_LEXICON: Lexicon = { words: new Map(), phrases: new Set() }

/** Parses the `words.bin` build artifact (`headword\tpinyin[\tflags]` lines). */
export function parseWords(raw: string): Lexicon {
  const words = new Map<string, string>()
  const phrases = new Set<string>()
  for (const line of raw.split('\n')) {
    if (!line) continue
    const [headword, pinyin, flags] = line.split('\t')
    if (pinyin === undefined) continue
    words.set(headword, pinyin)
    if (flags?.includes('p')) phrases.add(headword)
  }
  return { words, phrases }
}

/**
 * Re-exported from where it's now defined and parsed — see src/dict/cedict.ts.
 * Kept under this name too because nearly every card renderer already imports
 * it from here, and there is no reason to make them all point at `dict/` for a
 * type alone.
 */
export type { CedictEntry } from '../dict/cedict'

/**
 * Removes the definition store earlier versions wrote into the *page's* origin.
 *
 * Definitions now live in the service worker (background/defs-store.ts), so any
 * database left under a site's origin is 31MB of dead weight. Deleting is a
 * no-op where it never existed, so this needs no flag — and it can't be done
 * from the worker, which has no access to another origin's storage.
 */
export function dropLegacyPageDefsDb(): void {
  try {
    indexedDB.deleteDatabase('bb-subsgen')
  } catch (e) {
    console.warn('[bb-subsgen] could not drop the legacy page-origin defs db', e)
  }
}
