// The installed dictionary for a language, read at most once per page.

import { dictDb, getLexiconIn } from '../dict/store'
import type { Lexicon } from './pack'
import { packFor } from './packs'

/**
 * Nearly 200,000 entries, so this is called only when a query could actually
 * match one — `Lexicon.search` answers a query with nothing to match without
 * walking the index, and the caller does not ask for a dictionary it will not
 * search. Anyone who never searches for a new word never pays for it. This is
 * an extension-origin caller (the flashcards app), so it reads the store
 * directly rather than asking the worker for it — see src/dict/store.ts.
 *
 * Keyed by language rather than held in one slot: the Dictionary tab can switch
 * languages without a reload, and a single memo would keep answering with the
 * lexicon you just switched away from.
 *
 * A failed load is not cached — that entry is cleared so the next keystroke
 * tries again, rather than one transient error disabling search for the life of
 * the page. No dictionary installed resolves to the empty lexicon rather than
 * rejecting: a search page with nothing to search is not a failure. A language
 * with no pack is the one case that resolves null — there is nothing to read
 * the download with, so there is no lexicon to hand back.
 */
const dictionaries = new Map<string, Promise<Lexicon | null>>()

export function loadDictionary(lang: string): Promise<Lexicon | null> {
  const cached = dictionaries.get(lang)
  if (cached) return cached

  const loading = (async () => {
    const pack = packFor(lang)
    if (!pack) return null
    const text = await getLexiconIn(await dictDb(), lang)
    return pack.load(text ?? '')
  })().catch((e: unknown) => {
    dictionaries.delete(lang)
    throw e
  })
  dictionaries.set(lang, loading)
  return loading
}
