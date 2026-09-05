// Key plus language in, rendered string out.
//
// Deliberately not `chrome.i18n`: that resolves against the *browser's* UI
// locale and there is no way to point it at a setting. The whole feature is
// that the app speaks whatever `translationLang` says, so the table has to be
// ours.

import type { TranslationLang } from '../shared/settings'
import { en } from './en'
import { ru } from './ru'
import { es } from './es'
import { fr } from './fr'
import { de } from './de'
import { pt } from './pt'
import type { MessageKey, Messages } from './keys'
import type { Message, Params } from './message'

const MESSAGES: Record<TranslationLang, Messages> = { en, ru, es, fr, de, pt }

/** `{name}` — the braces are not otherwise used in any message. */
const PLACEHOLDER = /\{(\w+)\}/g

function formOf(message: Message, lang: TranslationLang, params: Params | undefined): string {
  if (typeof message === 'string') return message
  const count = params?.count
  if (typeof count !== 'number') return message.other
  // `select` can name a category this locale did not write — English has no
  // `few` — so `other` is always the answer of last resort.
  return message[new Intl.PluralRules(lang).select(count)] ?? message.other
}

/**
 * Numbers are interpolated through the target locale, so 12345 reads as 12,345
 * in English and 12 345 in Russian. Pass a string for anything where grouping
 * would be wrong — a port, a year, an id.
 */
export function translate(lang: TranslationLang, key: MessageKey, params?: Params): string {
  const form = formOf(MESSAGES[lang][key], lang, params)
  if (!params) return form

  return form.replace(PLACEHOLDER, (whole, name: string) => {
    const value = params[name]
    if (value === undefined) return whole
    return typeof value === 'number' ? value.toLocaleString(lang) : value
  })
}

/** What `useT` hands a component. */
export type Translate = (key: MessageKey, params?: Params) => string

/**
 * A `Translate` bound to one language.
 *
 * For callers that hold a language rather than a hook — `useT` itself, and the
 * tests of the modules that take `t` as a parameter.
 */
export function translateIn(lang: TranslationLang): Translate {
  return (key, params) => translate(lang, key, params)
}
