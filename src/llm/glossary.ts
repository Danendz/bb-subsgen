// Turning dictionary entries into something worth putting in a prompt.
//
// The extension already knows what a line is made of and what the learner has
// mastered, and a small local model does not. Handing it both is the cheapest
// quality win available here: it stops the model inventing glosses for words it
// half-recognizes, and stops it re-teaching 是 and 了 in every answer.
//
// Pure. The lookups happen elsewhere; this only decides what to say about them.

import type { Glossed } from '../chat/types'
import type { CedictEntry } from '../lang/zh/lexicon'
import { rankEntries } from '../lang/zh/entries'

/** How many senses of a word are worth the tokens. */
const SENSES = 2

/**
 * The best gloss for a word, or null when the dictionary has nothing usable.
 *
 * `rankEntries` is the same ranking the hover card uses, so the sense named
 * here is the sense the learner would have been shown.
 */
export function glossFor(word: string, entries: CedictEntry[] | undefined): Glossed | null {
  const [best] = rankEntries(entries ?? [], word)
  if (!best) return null

  const gloss = best.definitions.slice(0, SENSES).join('; ')
  if (!gloss) return null

  return { word, pinyin: best.pinyin, gloss }
}

export interface Split {
  known: string[]
  fresh: Glossed[]
}

/**
 * Splits the words of a line into the ones already mastered and the rest.
 *
 * Words with no dictionary entry are dropped from both sides rather than listed
 * bare: a name the dictionary has never heard of adds nothing to the prompt
 * that the line itself did not already say.
 */
export function splitByKnown(
  words: string[],
  known: ReadonlySet<string>,
  defs: Record<string, CedictEntry[]>,
): Split {
  const seen = new Set<string>()
  const split: Split = { known: [], fresh: [] }

  for (const word of words) {
    if (seen.has(word)) continue
    seen.add(word)

    if (known.has(word)) {
      split.known.push(word)
      continue
    }
    const glossed = glossFor(word, defs[word])
    if (glossed) split.fresh.push(glossed)
  }

  return split
}

/** One glossed word as a prompt line: `了 (le5) — completed action`. */
export function glossLine({ word, pinyin, gloss }: Glossed): string {
  return `${word} (${pinyin}) — ${gloss}`
}

/** How many entries a translation batch carries. Beyond this the prompt costs more than it buys. */
export const GLOSSARY_LIMIT = 20

/**
 * The words in a passage a translator is most likely to get wrong.
 *
 * A different question from the one `splitByKnown` answers. That one is about
 * the learner; this one is about the model, which does not care what you know.
 * What a small quantized model actually mangles is names and set phrases — so
 * the filter is multi-character words the dictionary has an entry for, longest
 * first, because a four-character entry in CC-CEDICT is almost always an idiom
 * or a name and a single character almost never needs saying.
 *
 * Single characters are excluded deliberately even though they are the most
 * ambiguous words in Chinese: glossing 了 and 的 on every batch would fill the
 * limit with grammar the model already has cold.
 */
export function translationGlossary(
  words: string[],
  defs: Record<string, CedictEntry[]>,
  limit = GLOSSARY_LIMIT,
): Glossed[] {
  const seen = new Set<string>()
  const found: Glossed[] = []

  for (const word of words) {
    if (word.length < 2 || seen.has(word)) continue
    seen.add(word)
    const glossed = glossFor(word, defs[word])
    if (glossed) found.push(glossed)
  }

  return found.sort((a, b) => b.word.length - a.word.length).slice(0, limit)
}
