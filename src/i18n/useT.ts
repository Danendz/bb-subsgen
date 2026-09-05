// The current UI language, shared by every component on the page.
//
// One `chrome.storage` listener and one read for the whole page, rather than a
// `useSettings()` per component: the app renders around thirty of them, and a
// hook that each opened its own subscription would do thirty storage reads on
// open and flash English while they landed.
//
// `ready` is what the roots gate on. Until the first read comes back the
// language is not known, and rendering the default would show English chrome to
// a Spanish reader for a frame — the exact thing this feature exists to stop.

import { useEffect, useState } from 'preact/hooks'
import { loadSettings, onSettingsChanged, type TranslationLang } from '../shared/settings'
import { translateIn, type Translate } from './t'

let current: TranslationLang | null = null
const listeners = new Set<() => void>()
let started = false

function publish(lang: TranslationLang) {
  if (current === lang) return
  current = lang
  // The page's own `lang` attribute follows the setting too, so that Chrome's
  // spellcheck, hyphenation and font fallback agree with what is on screen.
  document.documentElement.lang = lang
  for (const notify of listeners) notify()
}

function start() {
  if (started) return
  started = true
  void loadSettings().then((settings) => publish(settings.translationLang))
  onSettingsChanged((settings) => publish(settings.translationLang))
}

export interface Locale {
  t: Translate
  lang: TranslationLang
  /** False until the saved language has been read. Roots render nothing until it is true. */
  ready: boolean
}

export function useT(): Locale {
  const [lang, setLang] = useState(current)

  useEffect(() => {
    const notify = () => setLang(current)
    listeners.add(notify)
    start()
    notify()
    return () => {
      listeners.delete(notify)
    }
  }, [])

  // 'en' stands in only while `ready` is false, so nothing renders with it.
  const resolved = lang ?? 'en'
  return {
    lang: resolved,
    ready: lang !== null,
    t: translateIn(resolved),
  }
}
