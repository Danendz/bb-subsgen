// The setup wizard: pick what you study, then get its dictionary onto disk.
//
// Runs the download itself, on this page, rather than asking the worker to do
// it: the import is seconds of solid CPU across ~198k headwords, and an MV3
// worker is idle-terminated and can be killed under memory pressure, which
// would leave a half-written store behind. This page is the same extension
// origin, reaches the same database (src/dict/store.ts), and isn't killed
// mid-import.
//
// Named `SetupWizard` rather than `Setup`: review/Setup.tsx already exports
// `Setup` and owns `.setup-*` in style.css. Every class here is prefixed
// `wizard-` instead.

import { useEffect, useState } from 'preact/hooks'
import type { DictChangedMessage } from '../shared/messages'
import { useSettings } from '../settings/useSettings'
import { DICT_SOURCES, type DictSource } from '../dict/sources'
import { dictDb, getMetaIn, type DictMeta } from '../dict/store'
import { installDictionary, type InstallProgress } from '../dict/install'
import { navigate } from './hooks'

const SOURCES = Object.values(DICT_SOURCES)

function announceDictChanged(): void {
  void chrome.runtime.sendMessage({ type: 'bb-subsgen:dict-changed' } satisfies DictChangedMessage)
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

interface LangState {
  meta: DictMeta | null
  progress: InstallProgress | null
  error: string | null
  checking: boolean
  /** Set once a HEAD check finds a newer export than the one installed. */
  updateAvailable: boolean
  /** Set after a re-download completes and the entry count matches the old one. */
  noChangeNote: boolean
}

const EMPTY_LANG_STATE: LangState = {
  meta: null,
  progress: null,
  error: null,
  checking: false,
  updateAvailable: false,
  noChangeNote: false,
}

function LanguagePicker({
  enabled,
  onToggle,
}: {
  enabled: string[]
  onToggle: (lang: string, on: boolean) => void
}) {
  return (
    <div class="wizard-picker">
      <h2>What are you studying?</h2>
      <p class="hint">
        Checking a language just remembers it — nothing downloads until the next step.
      </p>
      {SOURCES.map((source) => (
        <label class="wizard-row" key={source.lang}>
          <input
            type="checkbox"
            checked={enabled.includes(source.lang)}
            onChange={(e) => onToggle(source.lang, e.currentTarget.checked)}
          />
          <span class="grow">{source.name}</span>
        </label>
      ))}
    </div>
  )
}

function RequirementRow({
  source,
  state,
  onInstall,
  onCheck,
}: {
  source: DictSource
  state: LangState
  onInstall: () => void
  onCheck: () => void
}) {
  const { meta, progress, error, checking, updateAvailable, noChangeNote } = state
  const busy = progress !== null

  return (
    <div class="wizard-requirement">
      <div class="wizard-requirement-head">
        <span class="grow">{source.name}</span>
        {meta && <span class="muted small">Installed {formatDate(meta.installedAt)}</span>}
      </div>

      {busy && (
        <div
          class="bar"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={progress.total ?? 0}
          aria-valuenow={progress.loaded}
          aria-label={progress.phase === 'download' ? 'Downloading' : 'Importing'}
        >
          <i
            style={{
              width: progress.total
                ? `${Math.min(100, (progress.loaded / progress.total) * 100)}%`
                : '100%',
            }}
          />
        </div>
      )}

      {error && <p class="hint verdict no">{error}</p>}

      <div class="toolbar">
        <button class="primary" disabled={busy} onClick={onInstall}>
          {busy
            ? progress.phase === 'download'
              ? 'Downloading…'
              : 'Importing…'
            : meta
              ? 'Re-download'
              : 'Install'}
        </button>
        {meta && !busy && (
          <button disabled={checking} onClick={onCheck}>
            {checking ? 'Checking…' : 'Check for update'}
          </button>
        )}
      </div>

      {updateAvailable && (
        <p class="hint">A newer export is available — install above to get it.</p>
      )}
      {noChangeNote && <p class="hint">Re-downloaded — no change from what was installed.</p>}

      <p class="hint small">{source.attribution}</p>
    </div>
  )
}

export function SetupWizard() {
  const { settings, loaded, update } = useSettings()
  const [langState, setLangState] = useState<Record<string, LangState>>({})
  // Re-entering with languages already chosen opens on step two; the picker
  // stays reachable through the button below rather than being hidden.
  const [showPicker, setShowPicker] = useState(false)

  const enabled = settings.enabledLanguages
  const at = (lang: string): LangState => langState[lang] ?? EMPTY_LANG_STATE
  const patch = (lang: string, next: Partial<LangState>) =>
    setLangState((current) => ({ ...current, [lang]: { ...at(lang), ...next } }))

  useEffect(() => {
    if (!loaded) return
    let live = true
    void (async () => {
      const db = await dictDb()
      for (const lang of enabled) {
        const meta = await getMetaIn(db, lang)
        if (live) patch(lang, { meta })
      }
    })()
    return () => {
      live = false
    }
    // Re-run whenever the set of enabled languages changes, compared by value
    // rather than by array identity — `enabled` is a fresh array every render.
  }, [loaded, enabled.join(',')])

  if (!loaded) return null

  const toggleLanguage = (lang: string, on: boolean) => {
    const next = on ? [...enabled, lang] : enabled.filter((l) => l !== lang)
    update({ enabledLanguages: next })
  }

  const install = async (source: DictSource) => {
    patch(source.lang, {
      progress: { phase: 'download', loaded: 0, total: null },
      error: null,
      updateAvailable: false,
      noChangeNote: false,
    })
    const before = at(source.lang).meta
    try {
      const db = await dictDb()
      const meta = await installDictionary({
        source,
        db,
        fetch,
        onProgress: (progress) => patch(source.lang, { progress }),
      })
      patch(source.lang, {
        meta,
        progress: null,
        noChangeNote: before !== null && before.entryCount === meta.entryCount,
      })
      announceDictChanged()
    } catch (e) {
      console.warn('[bb-subsgen] dictionary install failed', e)
      patch(source.lang, {
        progress: null,
        error: 'Could not download the dictionary. Check your connection and try again.',
      })
    }
  }

  const checkForUpdate = async (source: DictSource) => {
    patch(source.lang, { checking: true })
    try {
      const response = await fetch(source.url, { method: 'HEAD' })
      const lastModified = response.headers.get('last-modified')
      const meta = at(source.lang).meta
      patch(source.lang, {
        checking: false,
        updateAvailable: lastModified !== null && lastModified !== meta?.lastModified,
      })
    } catch (e) {
      console.warn('[bb-subsgen] update check failed', e)
      patch(source.lang, { checking: false })
    }
  }

  return (
    <div class="wizard">
      <h1>Set up your dictionaries</h1>

      {(showPicker || enabled.length === 0) && (
        <LanguagePicker enabled={enabled} onToggle={toggleLanguage} />
      )}

      {enabled.length > 0 && !showPicker && (
        <div class="toolbar">
          <button onClick={() => setShowPicker(true)}>Change languages</button>
        </div>
      )}

      {enabled.length > 0 && (
        <div class="wizard-requirements">
          <h2>Required</h2>
          {enabled.map((lang) => {
            const source = DICT_SOURCES[lang]
            if (!source) return null
            return (
              <RequirementRow
                key={lang}
                source={source}
                state={at(lang)}
                onInstall={() => void install(source)}
                onCheck={() => void checkForUpdate(source)}
              />
            )
          })}

          <p class="hint">
            Optional: a local LLM for chat and translation, ASR for videos with no subtitles, yt-dlp
            for YouTube audio, Chrome's built-in Translator, a Chinese TTS voice, and per-site
            reader permission. Each is configured from Settings once the dictionary above is
            installed — none of them are required to get started.
          </p>
        </div>
      )}

      <div class="toolbar">
        <button onClick={() => navigate('/')}>Done</button>
      </div>
    </div>
  )
}
