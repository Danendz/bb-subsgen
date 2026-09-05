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

/**
 * The default source: the language being studied on the surface that asked.
 *
 * Named rather than inlined so the Chinese assumption this module used to carry
 * is visible at the one place it survives — as a default argument, not a
 * constant folded into every pair.
 */
const DEFAULT_SOURCE = 'zh'

function pairFor(target: string, source: string = DEFAULT_SOURCE): LanguagePair {
  return { sourceLanguage: source, targetLanguage: target }
}

export function isTranslatorSupported(): boolean {
  return typeof globalThis.Translator?.create === 'function'
}

/**
 * Whether Chrome can translate `source`→`target` on this machine.
 *
 * Only `zh→en` and `zh→ru` are known to resolve directly; every other pair the
 * settings now offer has to be asked about rather than assumed, and a pair
 * Chrome will not serve is a normal answer, not a failure. `'downloadable'`
 * counts as usable — `createTranslator` fetches the pack on first use.
 */
export async function translatorAvailability(
  target: string,
  source: string = DEFAULT_SOURCE,
): Promise<Availability> {
  if (!isTranslatorSupported()) return 'unavailable'
  try {
    return await globalThis.Translator!.availability(pairFor(target, source))
  } catch (e) {
    console.warn('[bb-subsgen] translator availability check failed', e)
    return 'unavailable'
  }
}

/**
 * Creates a `source`→`target` translator, downloading the pack on first use.
 *
 * Must be called from within a user gesture. Callers should route through
 * `withUserActivation` rather than calling this directly.
 */
export async function createTranslator(
  target: string,
  onProgress?: (fraction: number) => void,
  source: string = DEFAULT_SOURCE,
): Promise<TranslatorLike> {
  const factory = globalThis.Translator
  if (!factory) throw new Error('Translator API unavailable')
  return factory.create({
    ...pairFor(target, source),
    monitor(monitor) {
      monitor.addEventListener('downloadprogress', (event) => {
        onProgress?.((event as ProgressEvent).loaded)
      })
    },
  })
}
