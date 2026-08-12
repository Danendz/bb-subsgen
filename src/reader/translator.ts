import { createTranslator, isTranslatorSupported } from '../lang/translate'
import { withUserActivation } from '../content/activation'
import type { TranslatorLike } from '../lang/translate'
import type { TranslationLang } from '../shared/settings'

export interface SentenceTranslator {
  /** Cached result, if this sentence has already been translated. */
  cached(sentence: string): string | undefined
  translate(sentence: string): Promise<string>
  destroy(): void
}

interface Deps {
  lang: () => TranslationLang
  /** Injected so tests don't need Chrome's Translator API. */
  create?: (lang: TranslationLang) => Promise<TranslatorLike>
}

/**
 * Translates whole sentences for the reader's card.
 *
 * Cached per sentence, not per word: hovering six words in one sentence is one
 * translate call and five cache hits. The cache is keyed by text, so scrolling
 * back to a paragraph you already read costs nothing either.
 *
 * The first call needs transient user activation. Shift alone will not grant it
 * — modifier-only keydowns are excluded from activation-triggering events — so
 * `withUserActivation` waits for the first real click or keypress on the page.
 * Until then `translate` resolves empty and the card simply renders without a
 * translation rather than blocking on one.
 */
export function createSentenceTranslator({ lang, create }: Deps): SentenceTranslator {
  const acquire = create ?? ((target: TranslationLang) => createTranslator(target))
  // Per language: switching target must not serve results from the old one.
  const caches = new Map<TranslationLang, Map<string, string>>()
  const translators = new Map<TranslationLang, Promise<TranslatorLike>>()
  const abort = new AbortController()

  const cacheFor = (target: TranslationLang) => {
    let cache = caches.get(target)
    if (!cache) {
      cache = new Map()
      caches.set(target, cache)
    }
    return cache
  }

  const translatorFor = (target: TranslationLang) => {
    let translator = translators.get(target)
    if (!translator) {
      translator = withUserActivation(() => acquire(target), { signal: abort.signal }).catch(
        (e) => {
          // Don't cache the rejection: a failure before the user has clicked
          // anything would otherwise persist for the life of the page.
          translators.delete(target)
          throw e
        },
      )
      translators.set(target, translator)
    }
    return translator
  }

  return {
    cached(sentence) {
      return cacheFor(lang()).get(sentence)
    },

    async translate(sentence) {
      if (!sentence || !isTranslatorSupported()) return ''

      // Captured, not re-read: a result arriving after the user switches
      // language belongs to the language it was requested for.
      const target = lang()
      const cache = cacheFor(target)
      const hit = cache.get(sentence)
      if (hit !== undefined) return hit

      try {
        const translator = await translatorFor(target)
        const translated = await translator.translate(sentence)
        cache.set(sentence, translated)
        return translated
      } catch (e) {
        if (!abort.signal.aborted) {
          console.warn('[bb-subsgen] sentence translation failed', e)
        }
        return ''
      }
    },

    destroy() {
      abort.abort()
      translators.clear()
    },
  }
}
