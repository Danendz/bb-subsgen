// Finding a Japanese word in the dictionary that is not in your deck yet.
//
// The same shape as `zh/search.ts` — prefix matches lead, containment follows,
// length breaks the tie — with one thing Chinese has no equivalent of: the
// query and the headwords are folded to hiragana before comparing. A learner
// who types ラーメン and a learner who types らーめん asked the same question,
// and a dictionary that answers only one of them is broken in a way that looks
// like a missing entry.

import { toHiragana } from './script'

/**
 * Headwords matching `query`, best first.
 *
 * `exclude` is the deck. Those words are already rendered above the
 * suggestions, and offering an Add button for something added is how a list
 * stops being trustworthy.
 */
export function searchHeadwords(
  words: Map<string, string>,
  query: string,
  exclude: ReadonlySet<string>,
  limit: number,
): string[] {
  const q = toHiragana(query.trim())
  if (!q) return []

  const starts: string[] = []
  const contains: string[] = []

  for (const headword of words.keys()) {
    if (exclude.has(headword)) continue
    const folded = toHiragana(headword)
    if (folded.startsWith(q)) starts.push(headword)
    else if (folded.includes(q)) contains.push(headword)
  }

  const byLength = (a: string, b: string) => a.length - b.length || (a < b ? -1 : 1)
  starts.sort(byLength)
  contains.sort(byLength)

  return [...starts, ...contains].slice(0, limit)
}
