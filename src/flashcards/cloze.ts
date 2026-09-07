// Turning a captured line into a question.

/**
 * Which word to blank out of a sentence.
 *
 * An explicit target — the word whose lookup captured the line — always wins.
 * Otherwise a line is only clozed when exactly one of its words is unknown,
 * which is both the fairest question and, not coincidentally, the case the
 * intake ordering serves first: those lines are chosen precisely because they
 * have one unknown word. Two unknowns and blanking one leaves the rest
 * unreadable, so the card falls back to plain recall.
 */
export function chooseTarget(
  words: string[],
  known: ReadonlySet<string>,
  explicit?: string,
): string | null {
  if (explicit && words.includes(explicit)) return explicit

  const unknown = [...new Set(words.filter((word) => !known.has(word)))]
  return unknown.length === 1 ? unknown[0] : null
}

/**
 * A word to blank when `chooseTarget` refuses and the line still has to be asked.
 *
 * `chooseTarget`'s "exactly one unknown word" rule protects a question whose
 * only cue is the rest of the line: blank one of three unknowns and what is
 * left is not readable enough to constrain the answer. The gloss-cued cloze
 * prints the blanked word's definition beside the gap, so the answer is
 * constrained by the definition rather than by the neighbours, and the rule has
 * nothing left to protect. This is the relaxed pick that path uses, and it is
 * total: any line with vocabulary in it has one.
 *
 * The rarest word, because the rarest word is the one worth testing — the same
 * argument `graduationOrder` makes for which line to teach first. A deck with
 * no word list installed has no ranks at all, and falls back to the longest
 * word: 时候 is more of a question than 的.
 */
export function fallbackTarget(
  words: string[],
  rankOf: (headword: string) => number | undefined,
): string | null {
  const distinct = [...new Set(words)]
  if (!distinct.length) return null

  const ranked = distinct.filter((word) => rankOf(word) !== undefined)
  if (ranked.length) return ranked.reduce((a, b) => (rankOf(b)! > rankOf(a)! ? b : a))
  return distinct.reduce((a, b) => (b.length > a.length ? b : a))
}
