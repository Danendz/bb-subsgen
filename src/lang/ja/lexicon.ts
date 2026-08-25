// The installed Japanese dictionary, and everything running text asks of it.
//
// The Japanese counterpart of `zh/lexicon.ts`: the index is private to this
// module, and what leaves is the object below, whose methods close over it. The
// two languages hold genuinely different indexes — Chinese keeps a set of
// phrasebook spans, Japanese keeps a word class per headword for #15 to
// deinflect against — and neither has to be visible to the other or to any
// caller, which is what the `Lexicon` split in `pack.ts` was for.

import type { LanguagePack, Lexicon, Match, Token } from '../pack'
import { furiganaParts } from './furigana'
import { matchAt, segment } from './segment'
import { searchHeadwords } from './search'

/**
 * `words` is every spelling and every reading JMdict knows, so lookup and
 * dictionary search see the whole file. `rare` is the subset that must never
 * claim a span of characters — see `lexiconFacts` in entries.ts. `classes` is
 * the verb or adjective class per headword, written at install time and read by
 * nothing yet: #15's deinflection validates a guessed dictionary form inside
 * the segmenter, which is synchronous over this text and has no definitions
 * round trip available to it.
 */
export interface JapaneseIndex {
  words: Map<string, string>
  rare: ReadonlySet<string>
  classes: Map<string, string>
}

/** Parses the installed word list (`headword\treading[\tflags]` lines). */
function parseWords(raw: string): JapaneseIndex {
  const words = new Map<string, string>()
  const rare = new Set<string>()
  const classes = new Map<string, string>()

  for (const line of raw.split('\n')) {
    if (!line) continue
    const [headword, reading, flags] = line.split('\t')
    if (reading === undefined) continue
    words.set(headword, reading)
    for (const flag of flags ? flags.split(',') : []) {
      if (flag === 'r') rare.add(headword)
      else if (flag) classes.set(headword, flag)
    }
  }
  return { words, rare, classes }
}

/** An empty `raw` parses to an empty index, which is a working lexicon that finds nothing. */
export function loadJapanese(raw: string, pack: LanguagePack): Lexicon {
  const index = parseWords(raw)

  return {
    pack,
    segment: (text: string): Token[] => segment(text, index),
    matchAt: (text: string, at: number): Match | null => {
      const found = matchAt(text, at, index)
      if (!found) return null
      return {
        text: found.text,
        reading: furiganaParts(found.text, found.reading),
        start: found.start,
        end: found.end,
      }
    },
    has: (headword: string) => index.words.has(headword),
    search: (query: string, exclude: ReadonlySet<string>, limit: number) =>
      // Asked here rather than inside the ranking, as Chinese asks it: a query
      // with no Japanese in it cannot match a headword, and walking 465,000 keys
      // to discover that is the one cost worth avoiding on every keystroke.
      pack.containsScript(query) ? searchHeadwords(index.words, query, exclude, limit) : [],
  }
}
