import { useEffect, useState } from 'preact/hooks'
import {
  DEFAULT_SETTINGS,
  loadSettings,
  READER_MODIFIERS,
  saveSettings,
  TRANSLATION_LANGS,
  type ReaderModifier,
  type Settings,
  type TranslationLang,
  type TranslationLayout,
} from '../shared/settings'
import {
  disableReaderFor,
  enableReaderFor,
  originOf,
  readerEnabledFor,
} from '../shared/reader-sites'
import type { Status, StatusResponse } from '../shared/messages'

type TabStatus = Status | 'not-bilibili'

const STATUS_LABEL: Record<TabStatus, string> = {
  loading: 'Loading subtitles…',
  'no-track': 'No subtitle track on this video.',
  active: 'Active on this video.',
  'not-bilibili': 'Open a Bilibili video for subtitles.',
}

async function currentTab(): Promise<chrome.tabs.Tab | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  return tab
}

async function fetchTabStatus(tabId: number | undefined): Promise<TabStatus> {
  if (!tabId) return 'not-bilibili'
  try {
    const response = (await chrome.tabs.sendMessage(tabId, {
      type: 'bb-subsgen:get-status',
    })) as StatusResponse | undefined
    return response?.status ?? 'not-bilibili'
  } catch {
    return 'not-bilibili' // no content script on this tab
  }
}

/** Short label for an origin — `https://www.zhihu.com` reads as `www.zhihu.com`. */
function hostLabel(origin: string): string {
  return origin.replace(/^https?:\/\//, '')
}

function Toggle({
  label,
  checked,
  disabled = false,
  onChange,
}: {
  label: string
  checked: boolean
  disabled?: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label class="row">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.currentTarget.checked)}
      />
    </label>
  )
}

function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  suffix = '',
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  suffix?: string
  onChange: (v: number) => void
}) {
  return (
    <label class="row">
      <span>
        {label} <span class="value">{value}{suffix}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onInput={(e) => onChange(Number(e.currentTarget.value))}
      />
    </label>
  )
}

export function App() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [loaded, setLoaded] = useState(false)
  const [tabStatus, setTabStatus] = useState<TabStatus>('loading')
  const [tab, setTab] = useState<chrome.tabs.Tab | undefined>()

  useEffect(() => {
    loadSettings().then((s) => {
      setSettings(s)
      setLoaded(true)
    })
    currentTab().then((t) => {
      setTab(t)
      fetchTabStatus(t?.id).then(setTabStatus)
    })
  }, [])

  const update = (patch: Partial<Settings>) => {
    const next = { ...settings, ...patch }
    setSettings(next)
    saveSettings(patch)
  }

  const origin = originOf(tab?.url)
  const readerOn = origin ? readerEnabledFor(settings, origin) : false

  /**
   * Chrome only prompts for an optional permission inside a user gesture, so
   * this has to run in the click handler itself — it can't be deferred to the
   * worker or awaited behind anything else.
   */
  const toggleReader = async (on: boolean) => {
    if (!origin) return

    if (on) {
      const granted = await enableReaderFor(origin)
      if (!granted) return // prompt declined; leave the switch where it was
      setSettings((s) => ({ ...s, readerOrigins: [...s.readerOrigins, origin] }))
      // A declared script only injects on load, so the page it was just
      // enabled for needs a reload before the reader is actually there.
      if (tab?.id) chrome.tabs.reload(tab.id)
    } else {
      await disableReaderFor(origin)
      setSettings((s) => ({
        ...s,
        readerOrigins: s.readerOrigins.filter((o) => o !== origin),
      }))
    }
  }

  if (!loaded) return null

  const modifierLabel =
    READER_MODIFIERS.find((m) => m.code === settings.readerModifier)?.label ?? 'Shift'

  return (
    <div class="app">
      <h1>bb-subsgen</h1>

      <h2 class="section">Language</h2>
      <label class="row">
        <span>Translate to</span>
        <select
          value={settings.translationLang}
          onChange={(e) => update({ translationLang: e.currentTarget.value as TranslationLang })}
        >
          {TRANSLATION_LANGS.map((lang) => (
            <option key={lang.code} value={lang.code}>
              {lang.label}
            </option>
          ))}
        </select>
      </label>
      <Toggle
        label="Tone colors"
        checked={settings.showToneColors}
        onChange={(v) => update({ showToneColors: v })}
      />
      <Toggle
        label="Show traditional in definitions"
        checked={settings.useTraditional}
        onChange={(v) => update({ useTraditional: v })}
      />

      <h2 class="section">Page reader</h2>
      {origin ? (
        <>
          <Toggle
            label={hostLabel(origin)}
            checked={readerOn}
            onChange={(v) => void toggleReader(v)}
          />
          <div class={readerOn ? '' : 'disabled'}>
            <label class="row">
              <span>Hold key</span>
              <select
                value={settings.readerModifier}
                onChange={(e) =>
                  update({ readerModifier: e.currentTarget.value as ReaderModifier })
                }
              >
                {READER_MODIFIERS.map((modifier) => (
                  <option key={modifier.code} value={modifier.code}>
                    {modifier.label}
                  </option>
                ))}
              </select>
            </label>
            <Toggle
              label="Translate the sentence"
              checked={settings.readerSentenceTranslation}
              onChange={(v) => update({ readerSentenceTranslation: v })}
            />
          </div>
          <p class="hint">
            Hold {modifierLabel} and point at a word; click it for characters. Select Chinese
            text for a phrase card.
          </p>
        </>
      ) : (
        <p class="hint">The reader can't run on this page.</p>
      )}

      <h2 class="section">Bilibili subtitles</h2>
      <p class={`status status-${tabStatus}`}>{STATUS_LABEL[tabStatus]}</p>

      <Toggle label="Enabled" checked={settings.enabled} onChange={(v) => update({ enabled: v })} />

      <div class={settings.enabled ? '' : 'disabled'}>
        <Toggle
          label="Show pinyin"
          checked={settings.showPinyin}
          onChange={(v) => update({ showPinyin: v })}
        />

        <Slider
          label="Font size"
          value={settings.fontSize}
          min={18}
          max={48}
          suffix="px"
          onChange={(v) => update({ fontSize: v })}
        />
        <Slider
          label="Word spacing"
          value={settings.wordSpacing}
          min={0}
          max={24}
          suffix="px"
          onChange={(v) => update({ wordSpacing: v })}
        />
        <Slider
          label="Backdrop opacity"
          value={settings.backdropOpacity}
          min={0}
          max={100}
          suffix="%"
          onChange={(v) => update({ backdropOpacity: v })}
        />

        <Slider
          label="Height"
          value={settings.positionPercent}
          min={0}
          max={85}
          suffix="%"
          onChange={(v) => update({ positionPercent: v })}
        />
        <Toggle
          label="Lift above player controls"
          checked={settings.liftAboveControls}
          onChange={(v) => update({ liftAboveControls: v })}
        />

        <hr class="divider" />

        <Toggle
          label="Translation"
          checked={settings.showTranslation}
          onChange={(v) => update({ showTranslation: v })}
        />

        <div class={settings.showTranslation ? '' : 'disabled'}>
          <Slider
            label="Translation size"
            value={settings.translationFontSize}
            min={10}
            max={32}
            suffix="px"
            onChange={(v) => update({ translationFontSize: v })}
          />
          <label class="row">
            <span>Translation layout</span>
            <select
              value={settings.translationLayout}
              onChange={(e) =>
                update({ translationLayout: e.currentTarget.value as TranslationLayout })
              }
            >
              <option value="inline">Same card</option>
              <option value="card">Separate card</option>
            </select>
          </label>
        </div>
      </div>

      <p class="hint">Shortcuts: Alt+P toggles pinyin, Alt+S cycles font size — for fullscreen.</p>

      <p class="attribution">
        Dictionary data from{' '}
        <a href="https://cc-cedict.org" target="_blank" rel="noreferrer">
          CC-CEDICT
        </a>
        , CC BY-SA 4.0.
      </p>
    </div>
  )
}
