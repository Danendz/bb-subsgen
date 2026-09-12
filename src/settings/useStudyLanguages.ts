// Which languages the "what am I studying" control may offer, and which of them
// are actually downloaded.
//
// Extracted from LanguageFilter.tsx when the app grew a second form of the same
// control: the popup keeps the labelled select, the app's rail draws a flag pill
// and a menu. Those are two designs rather than two densities — the split
// `.settings-group` already makes — but they answer the same three questions,
// and answering them twice meant two `dictStatus()` round trips whose results
// could disagree for a frame.
//
// Asks the worker for the installed set rather than opening the dictionary
// database, so the popup keeps paying a message instead of a store.

import { useEffect, useState } from 'preact/hooks'
import { enabledSources } from '../dict/sources'
import { dictStatus } from '../shared/dict-client'
import { useSettings } from './useSettings'
import type { DictSource } from '../dict/sources'

export interface StudyLanguages {
  /**
   * Every language the wizard was told about, not only the downloaded ones. One
   * ticked and never installed is still listed — dropping it would leave the
   * wizard as the only place that mentions the missing download.
   */
  languages: readonly DictSource[]
  /** Of those, the ones with a dictionary behind them. */
  installed: ReadonlySet<string>
  /** `''` is **All** — not "untouched, fall back". See LanguageFilter.tsx. */
  studyLang: string
  ready: boolean
  choose: (lang: string) => void
}

export function useStudyLanguages(): StudyLanguages {
  const { settings, loaded, update } = useSettings()
  const [installed, setInstalled] = useState<ReadonlySet<string> | null>(null)

  useEffect(() => {
    void dictStatus().then((languages) =>
      setInstalled(
        new Set(languages.filter((entry) => entry.installed).map((entry) => entry.lang)),
      ),
    )
  }, [])

  return {
    languages: loaded ? enabledSources(settings.enabledLanguages) : [],
    installed: installed ?? new Set(),
    studyLang: settings.studyLang,
    ready: loaded && installed !== null,
    choose: (studyLang) => update({ studyLang }),
  }
}
