// The one control that says which language you are studying right now.
//
// It replaces two: Review's setup panel and the Dictionary toolbar each grew
// their own picker writing the same `studyLang`, so the answer to "which
// language am I in" depended on which tab you happened to be on. One control in
// the chrome of both hosts is what makes it a mode rather than a per-screen
// preference.
//
// `''` is **All** — not "untouched, fall back". Every surface that needs exactly
// one language still resolves it through `resolveStudyLang`; what All changes is
// the settings rows, which then render for any installed language rather than
// for one.
//
// Asks the worker for the installed set rather than opening the dictionary
// database, so the popup keeps paying a message instead of a store.

import { useEffect, useState } from 'preact/hooks'
import { installedSources } from '../dict/sources'
import { dictStatus } from '../shared/dict-client'
import { Select } from './controls'
import { useSettings } from './useSettings'
import { useT } from '../i18n/useT'

export function LanguageFilter() {
  const { t } = useT()
  const { settings, loaded, update } = useSettings()
  const [installed, setInstalled] = useState<ReadonlySet<string> | null>(null)

  useEffect(() => {
    void dictStatus().then((languages) =>
      setInstalled(
        new Set(languages.filter((entry) => entry.installed).map((entry) => entry.lang)),
      ),
    )
  }, [])

  if (!loaded || !installed) return null

  const languages = installedSources(settings.enabledLanguages, installed)
  // Hidden below two, the same rule the pickers this replaces followed: a
  // control whose only options are All and the language you are already in is
  // one more thing on the screen and no choice at all.
  if (languages.length < 2) return null

  return (
    <div class="lang-filter">
      <Select
        label={t('filter.studying')}
        value={settings.studyLang}
        options={[
          { code: '', label: t('filter.all') },
          ...languages.map((source) => ({ code: source.lang, label: source.langName })),
        ]}
        onChange={(v) => update({ studyLang: v })}
      />
    </div>
  )
}
