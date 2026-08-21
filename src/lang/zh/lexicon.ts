// The installed Chinese dictionary, and everything running text asks of it.
//
// `words` and `phrases` are private to this module on purpose. They used to be
// the public shape of a lexicon, which meant every caller that wanted a reading
// or a headword test reached into a `Map` — and a language whose lookup is not
// a `Map` of headwords, which is most of them, could not have been added
// without changing all of them. What leaves this module is the object below,
// whose methods close over the two.

import type { LanguagePack, Lexicon, Match, Token } from '../pack'
import { matchAt } from './match'
import { searchHeadwords } from './search'
import { segment } from './segment'

/**
 * `words` is every headword CC-CEDICT knows, so lookup and dictionary search see
 * the whole file. `phrases` is the subset that must never claim a span of
 * characters — see `isPhrase` in entries.ts. Kept apart rather than filtered out
 * because a phrasebook entry is still a real thing to look up; it is only a bad
 * thing to *find* while cutting a sentence into words.
 */
export interface WordIndex {
  words: Map<string, string>
  phrases: ReadonlySet<string>
}

/** Parses the installed word list (`headword\tpinyin[\tflags]` lines). */
export function parseWords(raw: string): WordIndex {
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

/** An empty `raw` parses to an empty index, which is a working lexicon that finds nothing. */
export function loadChinese(raw: string, pack: LanguagePack): Lexicon {
  const index = parseWords(raw)

  return {
    pack,
    segment: (text: string): Token[] => segment(text, index),
    matchAt: (text: string, at: number): Match | null => matchAt(text, at, index.words),
    has: (headword: string) => index.words.has(headword),
    search: (query: string, exclude: ReadonlySet<string>, limit: number) =>
      // Asked here rather than inside the ranking: a query with no Han in it
      // cannot match a headword, and walking 200,000 keys to discover that is
      // the one cost worth avoiding on every keystroke.
      pack.containsScript(query) ? searchHeadwords(index.words, query, exclude, limit) : [],
  }
}

/**
 * Re-exported from where it's now defined and parsed — see src/dict/cedict.ts.
 * Kept under this name too because nearly every card renderer already imports
 * it from here, and there is no reason to make them all point at `dict/` for a
 * type alone.
 */
export type { CedictEntry } from '../../dict/cedict'
