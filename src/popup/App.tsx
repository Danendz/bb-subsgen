import { useEffect, useState } from 'preact/hooks'
import {
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  type Settings,
  type TranslationLayout,
} from '../shared/settings'
import type { Status, StatusResponse } from '../shared/messages'

type TabStatus = Status | 'not-bilibili'

const STATUS_LABEL: Record<TabStatus, string> = {
  loading: 'Loading subtitles…',
  'no-track': 'No subtitle track on this video.',
  active: 'Active on this video.',
  'not-bilibili': 'Open a Bilibili video to use bb-subsgen.',
}

async function fetchTabStatus(): Promise<TabStatus> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id) return 'not-bilibili'
  try {
    const response = (await chrome.tabs.sendMessage(tab.id, {
      type: 'bb-subsgen:get-status',
    })) as StatusResponse | undefined
    return response?.status ?? 'not-bilibili'
  } catch {
    return 'not-bilibili' // no content script on this tab
  }
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label class="row">
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.currentTarget.checked)} />
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

  useEffect(() => {
    loadSettings().then((s) => {
      setSettings(s)
      setLoaded(true)
    })
    fetchTabStatus().then(setTabStatus)
  }, [])

  const update = (patch: Partial<Settings>) => {
    const next = { ...settings, ...patch }
    setSettings(next)
    saveSettings(patch)
  }

  if (!loaded) return null

  return (
    <div class="app">
      <h1>bb-subsgen</h1>

      <p class={`status status-${tabStatus}`}>{STATUS_LABEL[tabStatus]}</p>

      <Toggle label="Enabled" checked={settings.enabled} onChange={(v) => update({ enabled: v })} />

      <div class={settings.enabled ? '' : 'disabled'}>
        <Toggle
          label="Show pinyin"
          checked={settings.showPinyin}
          onChange={(v) => update({ showPinyin: v })}
        />
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

        <hr class="divider" />

        <Toggle
          label="English translation"
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
