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
// This is the popup's form of the control, and the only one now: the app draws
// the same choice as a flag pill in its rail (src/app/LanguagePill.tsx). What
// the two share is useStudyLanguages.ts, whose header says why that is a split
// rather than a density token.

import { Select } from './controls'
import { useStudyLanguages } from './useStudyLanguages'
import { useT } from '../i18n/useT'

export function LanguageFilter() {
  const { t } = useT()
  const { languages, installed, studyLang, ready, choose } = useStudyLanguages()

  if (!ready) return null

  // Hidden below two, the same rule the pickers this replaces followed: a
  // control whose only options are All and the language you are already in is
  // one more thing on the screen and no choice at all.
  if (languages.length < 2) return null

  return (
    <div class="lang-filter">
      <Select
        label={t('filter.studying')}
        value={studyLang}
        options={[
          { code: '', label: t('filter.all') },
          // A language chosen in the wizard and never downloaded is listed and
          // not selectable: switching to it would empty every lookup on the
          // page, and dropping it from the list instead would leave the only
          // sign that the download is still owed inside the wizard.
          ...languages.map((source) => ({
            code: source.lang,
            label: installed.has(source.lang)
              ? source.langName
              : t('filter.notInstalled', { language: source.langName }),
            disabled: !installed.has(source.lang),
          })),
        ]}
        onChange={choose}
      />
    </div>
  )
}
