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

  // Per attach rather than once for the page's lifetime, since #12: the mirror
  // is keyed by language, and `apply()` can restart the reader in a different
  // one. A subscription that outlived the attach would keep handing the new
  // language the old language's known words.
  let known = new Set<string>()
  let stopKnown: (() => void) | null = null

  // Lazy and memoized: 4.5MB is only asked for the first time you actually hold
  // the modifier down, and never on a page you just read past. Dropped by
  // `stop()` because it belongs to a language, not to the page.
  let words: Promise<Lexicon | null> | null = null
  /** The language the attached reader was built for, so `apply` can spot a change. */
  let activeLang: string | null = null
  /**
   * A language picked from a card, overriding the site's declaration.
   *
   * Sticky for the life of the attached reader rather than per card: a learner
   * on a Japanese page whose site declaration says `zh` would otherwise
   * re-toggle on every single word. Never written to storage, so a reload
   * returns to the declaration and that stays the single source of truth for
   * what a site is.
   */
  let sessionLang: string | null = null

  /**
   * The language to read this page in, override first.
   *
   * Used by `start()` *and* `apply()`. If `apply()` kept calling
   * `resolveReaderLang` directly it would compare the stored language against
   * the overridden one and tear the reader down on the next settings echo,
   * silently reverting the toggle.
   */
  const effectiveLang = () => sessionLang ?? resolveReaderLang(settings, location.origin)

  const stop = () => {
    detach?.()
    translator?.destroy()
    mount?.destroy()
    stopKnown?.()
    detach = null
    translator = null
    mount = null
    words = null
    stopKnown = null
    known = new Set()
    activeLang = null
    // `sessionLang` deliberately survives. The toggle sets it and then calls
    // `apply()`, which stops before it starts — clearing it here would make the
    // rebuild undo the very change that asked for it.
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

    const lang = effectiveLang()

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

    stopKnown = watchKnownSet(lang, (next) => {
      known = next
    })

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
      // Read at card-build time, not captured: `enabledLanguages` can change
      // under an attached reader. A user with one pack installed sees no
      // control at all, and finding that out costs no round trip — which is
      // why this is the setting rather than one `bb-subsgen:dict-status` per
      // language inside an otherwise synchronous card build.
      otherLanguages: () =>
        settings.enabledLanguages
          .filter((code) => code !== activeLang)
          .flatMap((code) => {
            const other = packFor(code)
            return other ? [{ code: other.code, name: other.name }] : []
          }),
      onLanguage: (code) => {
        if (code === activeLang) return
        sessionLang = code
        apply()
      },
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
    if (detach && effectiveLang() !== activeLang) stop()
    start()
  }

  apply()
  onSettingsChanged((next) => {
    settings = next
    apply()
  })
}

void main().catch((e: unknown) => console.warn('[bb-subsgen] reader failed to start', e))
