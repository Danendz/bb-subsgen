// Everything the popup can set, somewhere you can actually read it.
//
// The popup is 300px wide and closes the moment you look away, which is fine
// for flipping pinyin off mid-video and wrong for deciding how you want to
// study. The groups are the same components (src/settings/) rendered against
// the same storage, so neither copy can drift from the other.
//
// One group differs, and has to: the page reader. The popup switches the site
// you are looking at, because it has one. This page has no tab behind it, so it
// manages the whole list instead — which is also the only place that list has
// ever been visible.

import { useState } from 'preact/hooks'
import { Hint, Section } from '../settings/controls'
import {
  LanguageSection,
  LocalModelSection,
  SpeechSection,
  modifierLabel,
  ReaderOptions,
  StudyingSection,
  SubtitlesSection,
} from '../settings/sections'
import { hostLabel, originFromInput, sortedSites } from '../settings/sites'
import { useSettings } from '../settings/useSettings'
import { disableReaderFor, enableReaderFor } from '../shared/reader-sites'
import { navigate } from './hooks'

/**
 * The sites the reader runs on, and the box that adds another.
 *
 * `readerOrigins` is not mirrored into local state: both helpers write it to
 * storage themselves, and the settings hook is listening, so the list follows
 * from the grant rather than from a guess about whether the grant succeeded.
 */
function ReaderSites({ origins }: { origins: string[] }) {
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const add = async () => {
    const origin = originFromInput(draft)
    if (!origin) {
      setError('That does not look like a site address. Try zhihu.com.')
      return
    }
    if (origins.includes(origin)) {
      setError(`${hostLabel(origin)} is already on.`)
      return
    }

    setError('')
    setBusy(true)
    try {
      // Nothing is awaited before this: Chrome only shows the permission
      // prompt inside the gesture that asked for it.
      if (await enableReaderFor(origin)) setDraft('')
      else setError('Chrome needs permission to reach that site before the reader can run there.')
    } finally {
      setBusy(false)
    }
  }

  const remove = async (origin: string) => {
    setBusy(true)
    try {
      await disableReaderFor(origin)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {sortedSites(origins).map((origin) => (
        <div class="row" key={origin}>
          <span class="grow">{hostLabel(origin)}</span>
          <button disabled={busy} onClick={() => void remove(origin)}>
            Remove
          </button>
        </div>
      ))}

      <div class="row">
        <input
          class="grow"
          type="text"
          placeholder="zhihu.com"
          value={draft}
          disabled={busy}
          onInput={(e) => setDraft(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void add()
          }}
        />
        <button class="primary" disabled={busy || !draft.trim()} onClick={() => void add()}>
          Add site
        </button>
      </div>

      {error ? (
        <p class="hint verdict no">{error}</p>
      ) : (
        <Hint>
          Chrome asks before each site is added, and turning one off hands that access straight
          back. Bilibili is already covered.
        </Hint>
      )}
    </>
  )
}

export function Settings() {
  const { settings, loaded, update } = useSettings()

  if (!loaded) return <p class="muted">Loading…</p>

  return (
    <>
      <StudyingSection settings={settings} update={update} />

      <Section title="Session">
        <p class="muted small" style={{ margin: 0 }}>
          How you are asked, what is included and how long a sitting runs are set where you start
          one — they read better next to the counts they change.
        </p>
        <div class="toolbar">
          <button onClick={() => navigate('/review')}>Open Review</button>
        </div>
      </Section>

      <LanguageSection settings={settings} update={update} />
      <LocalModelSection settings={settings} update={update} />
      <SpeechSection settings={settings} update={update} />

      <Section title="Dictionaries">
        <div class="toolbar">
          <button onClick={() => navigate('/setup')}>Manage dictionaries</button>
        </div>
        <Hint>Add a language you study, or check an installed one for an update.</Hint>
      </Section>

      <Section title="Page reader">
        <ReaderSites origins={settings.readerOrigins} />
        <div class={settings.readerOrigins.length ? '' : 'disabled'}>
          <ReaderOptions settings={settings} update={update} />
        </div>
        <Hint>
          Hold {modifierLabel(settings)} and point at a word; click it for characters. Select
          Chinese text for a phrase card.
        </Hint>
      </Section>

      <Section title="Bilibili subtitles">
        <SubtitlesSection settings={settings} update={update} />
        <Hint>Shortcuts: Alt+P toggles pinyin, Alt+S cycles font size — for fullscreen.</Hint>
      </Section>
    </>
  )
}
