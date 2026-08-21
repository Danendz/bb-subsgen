// Thin wrapper over Chrome's built-in on-device Translator API.
//
// Everything downstream depends on `TranslatorLike`, never on Chrome, so the
// scheduler and its tests stay free of browser globals.
//
// Availability notes, all of which shape the calling code:
//   - Desktop Chrome 138+ only; absent on mobile and on other browsers.
//   - `create()` needs transient user activation, else it throws
//     NotAllowedError — see content/activation.ts.
//   - Unavailable in Web Workers, so this cannot live in the service worker.

import type { TranslationLang } from '../shared/settings'

/** The only capability the rest of the extension needs from a translator. */
export interface TranslatorLike {
  translate(text: string): Promise<string>
}

export type Availability = 'unavailable' | 'downloadable' | 'downloading' | 'available'

interface LanguagePair {
  sourceLanguage: string
  targetLanguage: string
}

interface TranslatorFactory {
  availability(pair: LanguagePair): Promise<Availability>
  create(
    options: LanguagePair & { monitor?: (monitor: EventTarget) => void },
  ): Promise<TranslatorLike>
}

declare global {
  // eslint-disable-next-line no-var
  var Translator: TranslatorFactory | undefined
}

// Both supported targets are directly available from Chinese — verified
// against the live API, which reports zh→en and zh→ru alike. Neither has to
// pivot through a second translator, so `TranslatorLike` stays one hop.
function pairFor(target: TranslationLang): LanguagePair {
  return { sourceLanguage: 'zh', targetLanguage: target }
}

export function isTranslatorSupported(): boolean {
  return typeof globalThis.Translator?.create === 'function'
}

export async function translatorAvailability(target: TranslationLang): Promise<Availability> {
  if (!isTranslatorSupported()) return 'unavailable'
  try {
    return await globalThis.Translator!.availability(pairFor(target))
  } catch (e) {
    console.warn('[bb-subsgen] translator availability check failed', e)
    return 'unavailable'
  }
}

/**
 * Creates a zh→`target` translator, downloading the language pack on first use.
 *
 * Must be called from within a user gesture. Callers should route through
 * `withUserActivation` rather than calling this directly.
 */
export async function createTranslator(
  target: TranslationLang,
  onProgress?: (fraction: number) => void,
): Promise<TranslatorLike> {
  const factory = globalThis.Translator
  if (!factory) throw new Error('Translator API unavailable')
  return factory.create({
    ...pairFor(target),
    monitor(monitor) {
      monitor.addEventListener('downloadprogress', (event) => {
        onProgress?.((event as ProgressEvent).loaded)
      })
    },
  })
}
