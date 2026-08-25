// Entry point for the page reader.
//
// Unlike the Bilibili content script this isn't declared against the sites it
// runs on — it's registered at runtime for the origins you opt into, so the
// extension never asks for access to every website at install time. See
// shared/reader-sites.ts for the registration half.

import { attachReader } from './reader'
import { mountReader, type ReaderMount } from './mount'
import { createPageMode } from './page-mode'
import { createSentenceTranslator, type SentenceTranslator } from './translator'
import type { Lexicon } from '../lang/pack'
import { dropLegacyPageDefsDb } from '../shared/legacy-db'
import { packFor } from '../lang/packs'
import { loadLexicon, lookupDefs } from '../shared/dict-client'
import { loadSettings, onSettingsChanged } from '../shared/settings'
import { readerEnabledFor, resolveReaderLang } from '../shared/reader-sites'
import { watchKnownSet } from '../shared/flashcards-client'

declare global {
  interface Window {
    __bbSubsgenReader?: boolean
  }
}

async function main(): Promise<void> {
  // The reader is declared for bilibili.com *and* registered dynamically for
  // whatever you opt into — which overlap if you enable it on Bilibili. Chrome
  // injects both, so this guard is what keeps one page to one reader.
  if (window.__bbSubsgenReader) return
  window.__bbSubsgenReader = true

  dropLegacyPageDefsDb()

  let settings = await loadSettings()
  let mount: ReaderMount | null = null
  let translator: SentenceTranslator | null = null
  let detach: (() => void) | null = null

  // Subscribed once for the page's lifetime rather than per attach: the set
  // changes rarely, and re-reading it every time the reader is toggled on for
  // an origin would be work for nothing.
  let known = new Set<string>()
  watchKnownSet((next) => {
    known = next
  })

  // Lazy and memoized: 4.5MB is only asked for the first time you actually hold
  // the modifier down, and never on a page you just read past. Dropped by
  // `stop()` because it belongs to a language, not to the page.
  let words: Promise<Lexicon | null> | null = null
  /** The language the attached reader was built for, so `apply` can spot a change. */
  let activeLang: string | null = null

  const stop = () => {
    detach?.()
    translator?.destroy()
    mount?.destroy()
    detach = null
    translator = null
    mount = null
    words = null
    activeLang = null
  }

  /**
   * The language, the pack and the lexicon are resolved here rather than once
   * for the page, because `resolveReaderLang` can now answer differently for
   * the same page — an override written from another surface arrives through
   * the `onSettingsChanged` subscription below.
   *
   * `apply()` already tears the reader down and builds it again on every
   * settings change, so all three move in one step and the segmenter can never
   * end up on a different language from the definitions.
   */
  const start = () => {
    if (detach) return

    const lang = resolveReaderLang(settings, location.origin)

    // No pack means no segmenter and no script test, which is every question the
    // reader would ask — so it never attaches at all, rather than attaching and
    // finding nothing anywhere.
    const pack = packFor(lang)
    if (!pack) {
      console.warn('[bb-subsgen] no language pack for', lang, '— reader not starting')
      return
    }

    const getWords = () => (words ??= loadLexicon(lang))
    activeLang = lang

    mount = mountReader()
    translator = createSentenceTranslator({ lang: () => settings.translationLang })
    // Torn down by `detach()` rather than here, so the page gets its own
    // styling back on the same path that removes the listeners driving it.
    detach = attachReader({
      mount,
      pack,
      pageMode: createPageMode(),
      // Partially applied — see `DefsLookup` in shared/dict-client.ts.
      // Read inside the closure rather than captured, so flipping the script
      // setting reaches the next card without a reload.
      lookup: (headwords) => lookupDefs(lang, headwords, settings.useTraditional),
      translator,
      words: getWords,
      settings: () => settings,
      known: () => known,
    })
    console.log('[bb-subsgen] reader active on', location.origin, 'in', lang)
  }

  const apply = () => {
    if (!readerEnabledFor(settings, location.origin)) {
      stop()
      return
    }
    // `start()` is a no-op while attached, so a language that changed under a
    // running reader has to be torn down first — otherwise the segmenter stays
    // on the old language while the definitions follow the new one.
    if (detach && resolveReaderLang(settings, location.origin) !== activeLang) stop()
    start()
  }

  apply()
  onSettingsChanged((next) => {
    settings = next
    apply()
  })
}

void main().catch((e: unknown) => console.warn('[bb-subsgen] reader failed to start', e))
