// What a sitting needs in hand before it can start, wherever it is started from.
//
// There are two places that run a `Session` now — Review, which schedules the
// whole deck, and Learn, which runs one circle of the path — and everything
// between "here are the cards" and "here is a session" is identical for both:
// the same lexicon, and the same dozen lines of wiring that turn a card into
// four things to pick between. Duplicated, the second copy is the one that
// quietly stops translating its options.
//
// What is *not* here is which cards a sitting holds. That is the whole
// difference between the two screens — `buildSession` against `buildIntake` —
// and pushing it in here would mean one function with a flag deciding what kind
// of screen its caller is.

import { buildOptions } from './options'
import { dictDb, getLexiconIn } from '../../dict/store'
import { packFor } from '../../lang/packs'
import { lookupDefs, translatedGlosses } from '../../shared/dict-client'
import type { Choice } from '../../flashcards/choices'
import type { Item } from '../../flashcards/types'
import type { Lexicon } from '../../lang/pack'
import type { Settings } from '../../shared/settings'

/**
 * Extension-origin caller, so it reads the store directly rather than asking
 * the worker for it — see src/dict/store.ts. No dictionary installed loads the
 * empty lexicon: a deck with nothing to segment against is not a reason to fail
 * the whole screen. A language with no pack has nothing to load it with, and is
 * the one case that has to be null.
 */
export async function loadLexicon(lang: string): Promise<Lexicon | null> {
  const pack = packFor(lang)
  if (!pack) return null
  const text = await getLexiconIn(await dictDb(), lang)
  return pack.load(text ?? '')
}

export interface ChoiceSources {
  /**
   * The whole deck, not the session's cards: how near two words sit in
   * frequency is a better question the more words there are to ask it of.
   */
  deck: readonly Item[]
  words: Lexicon
  lang: string
  rankOf: (headword: string) => number | undefined
}

/**
 * The options every card in `cards` offers, resolved before the session starts.
 *
 * Ahead of the session rather than inside it so that no card pauses to fetch
 * its own options and no option set renders half-translated — see
 * `src/app/review/options.ts`.
 */
export async function resolveChoices(
  cards: Item[],
  { deck, words, lang, rankOf }: ChoiceSources,
  settings: Pick<Settings, 'useTraditional' | 'translationLang'>,
): Promise<ReadonlyMap<string, Choice[]>> {
  return buildOptions(
    cards,
    { deck, patterns: words.pack.patterns, rankOf },
    {
      defs: (headwords) => lookupDefs(lang, headwords, settings.useTraditional),
      // The sense the learner would have been shown, and only the first one: an
      // option is a thing to pick between, and three senses each makes the card
      // something to read instead.
      glossOf: (entries, headword) => words.pack.rank(entries, headword)[0]?.senses[0]?.gloss ?? '',
      // Words written with the same character as the target, which are the
      // dictionary's nearest thing to a plausible wrong answer.
      padding: (headword, exclude, count) =>
        words.search(Array.from(headword)[0] ?? '', exclude, count),
      translate: (requests) => translatedGlosses(lang, settings.translationLang, requests),
    },
  )
}
