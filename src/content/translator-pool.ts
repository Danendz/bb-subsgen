// Chrome's on-device translator, acquired once per language and driven over a
// whole track.
//
// Out of `main.ts` because none of it touches the video, the overlay or the
// settings — it is handed a list of strings and reports translations back by the
// index it was given. What it does own is the memo below, which is the reason it
// is a factory rather than four loose functions.

import { withUserActivation } from './activation'
import { runTranslationPass } from './translations'
import {
  createTranslator,
  isTranslatorSupported,
  translatorAvailability,
  type TranslatorLike,
} from '../lang/translate'
import { TRANSLATION_LANGS, type TranslationLang } from '../shared/settings'

export function labelFor(lang: TranslationLang): string {
  return TRANSLATION_LANGS.find((l) => l.code === lang)?.label ?? lang
}

/** How a translator is obtained, injected so the memo can be tested without Chrome. */
export type AcquireTranslator = (
  lang: TranslationLang,
  onDownload: (fraction: number) => void,
) => Promise<TranslatorLike>

const acquire: AcquireTranslator = (lang, onDownload) =>
  // Needs a user gesture on the page; resolves on the first click or keypress.
  // No abort signal: waiting for a gesture belongs to the page, not to whichever
  // pass happened to ask first, and cancelling it on every restart would mean a
  // transcript that keeps growing keeps throwing away the wait.
  withUserActivation(() => createTranslator(lang, onDownload))

export interface TranslateTrackDeps {
  lang: TranslationLang
  texts: string[]
  currentIndex: () => number
  /** Fires only when a language pack actually has to be fetched. */
  onDownload: (fraction: number) => void
  /** The translator exists; from here on the pass is the thing to report. */
  onReady: () => void
  onResult: (index: number, translated: string) => void
  signal: AbortSignal
}

export interface TranslatorPool {
  /** The translator for `lang`, created on first ask and shared thereafter. */
  translatorFor(
    lang: TranslationLang,
    onDownload: (fraction: number) => void,
  ): Promise<TranslatorLike>
  /** Acquires a translator and runs the whole track through it in the background. */
  translateTrack(deps: TranslateTrackDeps): Promise<void>
}

/**
 * One translator per language, for the life of the pool.
 *
 * Memoised because the pass is restarted every time a transcript grows — it
 * translates a snapshot, so new lines need a new run — and creating a translator
 * is the expensive half: it waits on a user gesture and, the first time, on a
 * language pack download. The promise rather than the translator is stored, so
 * two restarts arriving together share one creation instead of racing.
 *
 * `main()` builds exactly one of these, at page scope, and deliberately does not
 * rebuild it between videos: a translator is per language, and the video it was
 * first wanted for has nothing to do with it.
 */
export function createTranslatorPool(create: AcquireTranslator = acquire): TranslatorPool {
  const translators = new Map<TranslationLang, Promise<TranslatorLike>>()

  const translatorFor: TranslatorPool['translatorFor'] = (lang, onDownload) => {
    const existing = translators.get(lang)
    if (existing) return existing

    const created = create(lang, onDownload)
    translators.set(lang, created)
    // A failure must not be remembered as the answer — the usual cause is a page
    // that has not been clicked yet, and the next attempt may well succeed.
    created.catch(() => translators.delete(lang))
    return created
  }

  return {
    translatorFor,

    /**
     * Silently does nothing where the API doesn't exist (non-Chrome, Chrome < 138,
     * mobile) — an absent translated line is the correct fallback, never a broken one.
     */
    async translateTrack({
      lang,
      texts,
      currentIndex,
      onDownload,
      onReady,
      onResult,
      signal,
    }: TranslateTrackDeps): Promise<void> {
      if (!isTranslatorSupported()) {
        console.log(
          '[bb-subsgen] Translator API not exposed here — skipping translation.',
          'Needs desktop Chrome 138+.',
        )
        return
      }
      if (!translators.has(lang)) {
        console.log(`[bb-subsgen] zh→${lang} availability:`, await translatorAvailability(lang))
      }

      let translator: TranslatorLike
      try {
        translator = await translatorFor(lang, onDownload)
      } catch (e) {
        if (!signal.aborted) console.warn('[bb-subsgen] could not create translator', e)
        return
      }
      if (signal.aborted) return
      onReady()

      console.log('[bb-subsgen] translating', texts.length, 'cues to', lang)
      await runTranslationPass({ texts, translator, currentIndex, onResult, signal })
    },
  }
}
