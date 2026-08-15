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
