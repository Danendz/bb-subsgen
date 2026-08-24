// Reading parts, flattened back to text.
//
// The one thing every holder of a `ReadingPart[]` eventually wants and should
// not write itself: a run of parts as a single string, for a `dataset`
// attribute, a clipboard copy, or the ranking signal `rankEntries` takes. The
// parts already carry display text, so this joins — it does not parse, and
// nothing here knows what a tone digit is.

import type { ReadingPart } from './pack'

/**
 * A reading as one string.
 *
 * The separator is a parameter because the two callers genuinely disagree: a
 * reading read back off the DOM wants spaces between syllables, and the card's
 * `also read` line runs them together the way a dictionary prints a word.
 */
export function readingText(parts: readonly ReadingPart[], separator = ' '): string {
  return parts.map((part) => part.text).join(separator)
}

/**
 * The inverse of `readingText`, for a reading that has been round-tripped
 * through the DOM.
 *
 * Splitting on the separator is legitimate here and nowhere else: this is
 * undoing a join this module performed, not recovering an alignment from a
 * language's orthography. What cannot come back is what was never written down
 * — `base` and `tone` — so the parts say so rather than guessing.
 */
export function readingFromText(text: string, separator = ' '): ReadingPart[] {
  return text
    .split(separator)
    .filter(Boolean)
    .map((piece) => ({ base: '', text: piece, tone: null }))
}
