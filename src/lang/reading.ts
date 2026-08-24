// Reading parts, flattened back to text, and the colour a tone is drawn in.
//
// What every holder of a `ReadingPart[]` eventually wants and should not write
// itself: a run of parts as a single string, for a `dataset` attribute, a
// clipboard copy, or the ranking signal `rankEntries` takes. The parts already
// carry display text, so this joins — it does not parse, and nothing here knows
// what a tone digit is.
//
// The palette is here rather than in `zh/tone.ts`, where it started, because a
// tone number is neutral once it sits on a `ReadingPart` — and the alternative
// was `content/card.ts` importing a Chinese module to draw a colour, which is
// one of the two exceptions #8 was closing.

import type { ReadingPart } from './pack'

// The conventional MDBG tone→color mapping, softened to light pastels so the
// reading stays legible over video instead of reading as neon.
const TONE_COLORS: Record<number, string> = {
  1: '#ff8a8a', // coral
  2: '#ffc46b', // amber
  3: '#7ee0a8', // mint
  4: '#8ab6ff', // sky
  5: '#c3c8d0', // soft gray (neutral)
}

/** MDBG standard tone-coloring convention. */
export function toneColor(tone: number): string {
  return TONE_COLORS[tone] ?? TONE_COLORS[5]
}

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
