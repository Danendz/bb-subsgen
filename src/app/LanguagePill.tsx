// The app's form of the study-language control: a flag at the head of the rail,
// opening a menu.
//
// Two things make it a different design from the popup's labelled select rather
// than a denser version of it (src/settings/useStudyLanguages.ts carries the
// split):
//
//   - A flag reads at a glance from the corner of the eye, which is the whole
//     job of something that sits above the navigation all day. A select saying
//     "Studying: Chinese" is a settings row, and the rail is not a form.
//   - Its last row is not a language. "Add a language" goes to the setup
//     wizard, which until now was reachable only from a link buried inside
//     Settings › Language — the one screen you cannot find if you have not
//     installed anything yet.
//
// Rendered even when only one language is installed, for that second reason:
// the popup's rule of hiding a one-option picker would hide the front door.

import { useEffect, useRef, useState } from 'preact/hooks'
import { useStudyLanguages } from '../settings/useStudyLanguages'
import { Flag } from './flags'
import { ChevronIcon } from './icons'
import { navigate } from './hooks'
import { useT } from '../i18n/useT'

export function LanguagePill() {
  const { t } = useT()
  const { languages, installed, studyLang, ready, choose } = useStudyLanguages()
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  // Pointerdown rather than click: a menu that survives until mouseup flickers
  // when you press on the thing you were aiming at behind it.
  useEffect(() => {
    if (!open) return
    const onDown = (e: Event) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    addEventListener('pointerdown', onDown)
    addEventListener('keydown', onKey)
    return () => {
      removeEventListener('pointerdown', onDown)
      removeEventListener('keydown', onKey)
    }
  }, [open])

  if (!ready) return null

  const current = languages.find((source) => source.lang === studyLang)

  return (
    <div class="lang-pill" ref={box}>
      <button
        class={`pill-face ${open ? 'open' : ''}`}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((was) => !was)}
      >
        {current ? <Flag lang={current.lang} /> : <span class="pill-all" aria-hidden="true" />}
        <span class="pill-name">{current ? current.langName : t('filter.all')}</span>
        <ChevronIcon />
      </button>

      {open && (
        <div class="pill-menu panel" role="menu">
          <button
            role="menuitemradio"
            aria-checked={studyLang === ''}
            class={`pill-item ${studyLang === '' ? 'on' : ''}`}
            onClick={() => {
              choose('')
              setOpen(false)
            }}
          >
            <span class="pill-all" aria-hidden="true" />
            <span class="grow">{t('filter.all')}</span>
          </button>

          {languages.map((source) => (
            // A language chosen in the wizard and never downloaded is listed and
            // not selectable: switching to it would empty every lookup on the
            // page, and dropping it from the list would leave the wizard as the
            // only sign the download is still owed.
            <button
              key={source.lang}
              role="menuitemradio"
              aria-checked={studyLang === source.lang}
              disabled={!installed.has(source.lang)}
              class={`pill-item ${studyLang === source.lang ? 'on' : ''}`}
              onClick={() => {
                choose(source.lang)
                setOpen(false)
              }}
            >
              <Flag lang={source.lang} />
              <span class="grow">{source.langName}</span>
              {!installed.has(source.lang) && <span class="tag">{t('pill.notInstalled')}</span>}
            </button>
          ))}

          <button
            role="menuitem"
            class="pill-item add"
            onClick={() => {
              setOpen(false)
              navigate('/setup')
            }}
          >
            <span class="pill-plus" aria-hidden="true">
              +
            </span>
            <span class="grow">{t('pill.addLanguage')}</span>
          </button>
        </div>
      )}
    </div>
  )
}
