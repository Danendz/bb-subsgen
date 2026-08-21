// Finding a word in the dictionary that is not in your deck yet.
//
// Separate from `dict.ts`, which only parses and loads. This is the ranking, and
// it is pure so the ordering can be argued with in tests rather than by typing
// into the box and squinting.

import { parseWords, EMPTY_LEXICON, type Lexicon } from './zh/lexicon'
import { dictDb, getLexiconIn } from '../dict/store'
import { isHan } from './zh/segment'

/**
 * The dictionary for one language, read at most once per page.
 *
 * Nearly 200,000 entries, so this is called only when a query could actually
 * match one — see `hasHan`. Anyone who never searches for a new word never
 * pays for it. This is an extension-origin caller (the flashcards app), so it
 * reads the store directly rather than asking the worker for it — see
 * src/dict/store.ts.
 *
 * Keyed by language rather than held in one slot: the Dictionary tab can switch
 * languages without a reload, and a single memo would keep answering with the
 * lexicon you just switched away from.
 *
 * A failed load is not cached — that entry is cleared so the next keystroke
 * tries again, rather than one transient error disabling search for the life of
 * the page. No dictionary installed resolves to the empty lexicon rather than
 * rejecting: a search page with nothing to search is not a failure.
 */
const dictionaries = new Map<string, Promise<Lexicon>>()

export function loadDictionary(lang: string): Promise<Lexicon> {
  const cached = dictionaries.get(lang)
  if (cached) return cached

  const loading = (async () => {
    const text = await getLexiconIn(await dictDb(), lang)
    return text === null ? EMPTY_LEXICON : parseWords(text)
  })().catch((e: unknown) => {
    dictionaries.delete(lang)
    throw e
  })
  dictionaries.set(lang, loading)
  return loading
}

/** Whether a query could match a headword at all. */
export function hasHan(query: string): boolean {
  return Array.from(query).some(isHan)
}

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
  if (!q || !hasHan(q)) return []

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
