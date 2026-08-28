// Finding a word in the dictionary that is not in your deck yet.
//
// Separate from `lexicon.ts`, which only parses and answers. This is the
// ranking, and it is pure so the ordering can be argued with in tests rather
// than by typing into the box and squinting.

/**
 * Headwords matching `query`, best first.
 *
 * Prefix matches lead. Typing 学 nearly always means "a word beginning 学", so
 * 大学 is a worse answer to that keystroke than 学习 is — but it is still an
 * answer, which is why containment follows rather than being dropped.
 *
 * Length breaks the tie inside each group. Shorter words are commoner, and it
 * keeps the exact word you typed off the bottom of a list of idioms that happen
 * to contain it.
 *
 * `exclude` is the deck. Those words are already rendered above the suggestions,
 * and offering an Add button for something added is how a list stops being
 * trustworthy.
 */
export function searchHeadwords(
  words: Map<string, string>,
  query: string,
  exclude: ReadonlySet<string>,
  limit: number,
): string[] {
  const q = query.trim()
  if (!q) return []

  const starts: string[] = []
  const contains: string[] = []

  for (const headword of words.keys()) {
    if (exclude.has(headword)) continue
    if (headword.startsWith(q)) starts.push(headword)
    else if (headword.includes(q)) contains.push(headword)
  }

  const byLength = (a: string, b: string) => a.length - b.length || (a < b ? -1 : 1)
  starts.sort(byLength)
  contains.sort(byLength)

  return [...starts, ...contains].slice(0, limit)
}
