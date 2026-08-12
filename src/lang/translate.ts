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

const PAIR: LanguagePair = { sourceLanguage: 'zh', targetLanguage: 'en' }

export function isTranslatorSupported(): boolean {
  return typeof globalThis.Translator?.create === 'function'
}

export async function translatorAvailability(): Promise<Availability> {
  if (!isTranslatorSupported()) return 'unavailable'
  try {
    return await globalThis.Translator!.availability(PAIR)
  } catch (e) {
    console.warn('[bb-subsgen] translator availability check failed', e)
    return 'unavailable'
  }
}

/**
 * Creates a zh→en translator, downloading the language pack on first use.
 *
 * Must be called from within a user gesture. Callers should route through
 * `withUserActivation` rather than calling this directly.
 */
export async function createTranslator(
  onProgress?: (fraction: number) => void,
): Promise<TranslatorLike> {
  const factory = globalThis.Translator
  if (!factory) throw new Error('Translator API unavailable')
  return factory.create({
    ...PAIR,
    monitor(monitor) {
      monitor.addEventListener('downloadprogress', (event) => {
        onProgress?.((event as ProgressEvent).loaded)
      })
    },
  })
}
