// Reading parts, flattened back to text, and the colour a tone is drawn in.
//
// What every holder of a `ReadingPart[]` eventually wants and should not write
// itself: a run of parts as a single string, for a `dataset` attribute, a
// clipboard copy, or the ranking signal `rankEntries` takes. The parts already
// carry display text, so this joins — it does not parse, and nothing here knows
// what a tone digit is.
//
// `readingColumns` is the same kind of thing one level up: the parts already say
// which characters they sit over, so cutting a word into the columns a renderer
// draws is arithmetic on `base`, not knowledge of an orthography. It lives here
// so the rule for an alignment a producer could not make has one home and a
// `node` test, rather than a branch inside a DOM builder.
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

/** One character-and-what-is-read-above-it pair, as a renderer draws it. */
export interface ReadingColumn {
  /** The characters drawn on the lower row. */
  base: string
  /** What is drawn above them. Empty draws nothing — kana. */
  parts: readonly ReadingPart[]
}

/**
 * A reading cut into the columns it is drawn in.
 *
 * Three rules, and each is a rule rather than an accident:
 *
 * 1. One part with no `base` collapses the whole word to a single column. Both
 *    producers are all-or-nothing about alignment — `zh/reading.ts` blanks every
 *    base when syllable and character counts disagree, `ja/furigana.ts` returns
 *    one unaligned part — so a half-aligned word could only come from a bug, and
 *    drawing half of it in place would be a confident lie in exactly the spot
 *    both of them refuse to guess.
 * 2. Bases that do not spell `text` back collapse it too. Whatever a producer
 *    gets wrong, it must not cost a subtitle line its characters.
 * 3. Otherwise, one column per part.
 *
 * The fallback is the flat layout every Chinese line used before #22, expressed
 * as a one-column grid — which is why the DOM builder needs no branch of its
 * own. The branch is here, where the `node` suite can see it.
 */
export function readingColumns(
  text: string,
  parts: readonly ReadingPart[] | null,
): ReadingColumn[] {
  const flat = [{ base: text, parts: parts ?? [] }]
  if (!parts?.length) return flat
  if (parts.some((part) => part.base === '')) return flat
  if (parts.map((part) => part.base).join('') !== text) return flat

  // A part with no text is a run read as it is written — the column still
  // exists, and still reserves its upper row, but nothing is drawn there.
  return parts.map((part) => ({ base: part.base, parts: part.text ? [part] : [] }))
}
