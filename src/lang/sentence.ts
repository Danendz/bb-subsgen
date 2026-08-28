// The scan that finds the sentence around a character, with the table that says
// what ends one left to the language.
//
// Both halves were in `zh/sentence.ts`, whose header already claimed the
// terminators were the language's business and the scan was not. They were in
// the same file, so the second half of that sentence was aspirational: Japanese
// could only have had the scan by importing a Chinese module, which is the one
// thing `src/lang/<code>/` exists to prevent.
//
// The outward walk and the length cap are genuinely neutral — "start where the
// cursor is and stop at the nearest terminator on each side" is not a fact
// about any orthography. Which characters those are is nothing else.

export interface Span {
  start: number
  /** Exclusive. */
  end: number
}

/** Sentences can run long; a whole paragraph is not worth translating for one word. */
const MAX_SENTENCE_LENGTH = 220

/**
 * The sentence containing `index`, as offsets into `text`.
 *
 * Scans outward from the hovered character rather than splitting the whole
 * block, so a long article costs the same as a short one.
 *
 * Terminators keep their place in the sentence they end — 。 belongs to the
 * clause before it, and a translator reads better with it than without.
 */
export function sentenceAt(text: string, index: number, terminators: ReadonlySet<string>): Span {
  if (!text) return { start: 0, end: 0 }

  const clamped = Math.max(0, Math.min(index, text.length - 1))

  let start = clamped
  while (start > 0 && !terminators.has(text[start - 1])) start -= 1

  let end = clamped
  while (end < text.length && !terminators.has(text[end])) end += 1
  // Include the terminator itself.
  if (end < text.length) end += 1

  // A run with no punctuation at all — a heading, a table cell, minified prose —
  // would otherwise hand the translator the entire block.
  if (end - start > MAX_SENTENCE_LENGTH) {
    start = Math.max(start, clamped - MAX_SENTENCE_LENGTH / 2)
    end = Math.min(end, clamped + MAX_SENTENCE_LENGTH / 2)
  }

  return { start, end }
}

/** The sentence around `index`, trimmed. Empty when there's nothing to translate. */
export function sentenceTextAt(
  text: string,
  index: number,
  terminators: ReadonlySet<string>,
): string {
  const { start, end } = sentenceAt(text, index, terminators)
  return text.slice(start, end).trim()
}
