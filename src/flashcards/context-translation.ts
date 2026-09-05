// Which stored translations no longer match the language they are read in.
//
// The target language is a setting, so a deck outlives the choice that produced
// it: a learner who moves from English to Spanish keeps every card and every one
// of them keeps answering in English. This decides which contexts to re-translate
// and folds the answers back in.
//
// Pure, and separate from the review screen, because the interesting part is the
// decision rather than the fetch — and a decision that runs on the irreplaceable
// database is worth testing without a DOM.

import type { TranslationLang } from '../shared/settings'
import type { Context } from './types'

/**
 * A context worth re-translating, and where it sits on the card.
 *
 * The index is carried because contexts are addressed by position — a card can
 * hold the same sentence twice, met in two places — so matching results back up
 * by text would put an answer on the wrong one.
 */
export interface StaleTranslation {
  index: number
  text: string
}

/**
 * Contexts whose translation is in a language that is no longer the target.
 *
 * A context with no translation at all is not stale: there is nothing to
 * re-translate, and the capture path deliberately leaves it empty rather than
 * blocking on a translator. An *untagged* one is stale — schema 5 stamped
 * everything already in the deck, so the only untagged rows left arrive by
 * importing a backup written before the tag existed, and treating those as
 * matching is the exact assumption the tag was added to stop making.
 */
export function staleTranslations(
  contexts: Context[],
  target: TranslationLang,
): StaleTranslation[] {
  const stale: StaleTranslation[] = []
  contexts.forEach((context, index) => {
    if (!context.translation || !context.text) return
    if (context.translationLang === target) return
    stale.push({ index, text: context.text })
  })
  return stale
}

/**
 * Rewrites the contexts a re-translation answered, leaving the rest untouched.
 *
 * A context missing from `translations` keeps the text and the tag it already
 * had. That is the load-bearing half: `Context` freezes its translation because
 * a card that cannot render its own answer is worthless, so a failed lookup has
 * to leave the stale answer standing rather than blank the card. The tag is only
 * moved where the text moved with it, so a card that failed today is asked about
 * again tomorrow instead of being marked done.
 */
export function withTranslations(
  contexts: Context[],
  target: TranslationLang,
  translations: Map<number, string>,
): Context[] {
  if (!translations.size) return contexts
  return contexts.map((context, index) => {
    const translated = translations.get(index)?.trim()
    if (!translated) return context
    return { ...context, translation: translated, translationLang: target }
  })
}
