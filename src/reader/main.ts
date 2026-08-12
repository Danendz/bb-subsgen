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
import { loadWords, dropLegacyPageDefsDb } from '../lang/dict'
import { lookupDefs } from '../shared/dict-client'
import { loadSettings, onSettingsChanged } from '../shared/settings'
import { readerEnabledFor } from '../shared/reader-sites'

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

  // Lazy and memoized: 4.5MB is only fetched the first time you actually hold
  // the modifier down, and never on a page you just read past.
  let words: Promise<Map<string, string>> | null = null
  const getWords = () => (words ??= loadWords())

  const stop = () => {
    detach?.()
    translator?.destroy()
    mount?.destroy()
    detach = null
    translator = null
    mount = null
  }

  const start = () => {
    if (detach) return
    mount = mountReader()
    translator = createSentenceTranslator({ lang: () => settings.translationLang })
    // Torn down by `detach()` rather than here, so the page gets its own
    // styling back on the same path that removes the listeners driving it.
    detach = attachReader({
      mount,
      pageMode: createPageMode(),
      lookup: lookupDefs,
      translator,
      words: getWords,
      settings: () => settings,
    })
    console.log('[bb-subsgen] reader active on', location.origin)
  }

  const apply = () => {
    if (readerEnabledFor(settings, location.origin)) start()
    else stop()
  }

  apply()
  onSettingsChanged((next) => {
    settings = next
    apply()
  })
}

void main().catch((e: unknown) => console.warn('[bb-subsgen] reader failed to start', e))
