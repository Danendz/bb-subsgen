// Definitions in the language the app is being read in.
//
// CC-CEDICT and JMdict_e ship English only, so every surface that shows a
// definition shows English regardless of the target language. This is the shared
// hook those surfaces use to get the translated form, falling back to the
// English they already hold.
//
// A hook rather than a wrapper around `rank`: the translation is asynchronous
// and the English is not, so the definition has to render immediately and
// improve when the answer arrives. Anything that made the render wait would put
// a network-free but still async call in front of every card.

import { useEffect, useState } from 'preact/hooks'
import type { GlossRequest } from '../dict/gloss-translate'
import { translatedGlosses } from '../shared/dict-client'
import type { TranslationLang } from '../shared/settings'

/**
 * Translated senses per headword, empty until they arrive and for `en`.
 *
 * Callers read `translated[headword] ?? englishSenses` — the English is the
 * fallback, not the loading state, so nothing ever renders blank.
 */
export function useTranslatedGlosses(
  lang: string,
  target: TranslationLang | null,
  requests: GlossRequest[],
): Record<string, string[]> {
  const [glosses, setGlosses] = useState<Record<string, string[]>>({})
  // Keyed on the words rather than the array: `requests` is rebuilt on every
  // render, and an effect that depended on its identity would re-translate the
  // same card on every keystroke elsewhere on the page.
  const key = requests.map((r) => r.headword).join('|')

  useEffect(() => {
    if (!target || target === 'en' || !requests.length) return

    let live = true
    void translatedGlosses(lang, target, requests).then((found) => {
      if (live) setGlosses(found)
    })
    return () => {
      live = false
    }
  }, [lang, target, key])

  // Cleared rather than kept when the target changes: showing Spanish under a
  // French heading for one frame is worse than showing the English.
  useEffect(() => setGlosses({}), [target, lang])

  return glosses
}
