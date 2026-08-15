import { useEffect, useState } from 'preact/hooks'
import {
  DEFAULT_SETTINGS,
  loadSettings,
  MAX_SPEECH_RATE,
  MIN_SPEECH_RATE,
  READER_MODIFIERS,
  saveSettings,
  TRANSLATION_LANGS,
  type ReaderModifier,
  type Settings,
  type TranslationLang,
  type TranslationLayout,
} from '../shared/settings'
import { isRemote, listVoices, speak } from '../shared/speak'
import {
  disableReaderFor,
  enableReaderFor,
  originOf,
  readerEnabledFor,
} from '../shared/reader-sites'
import { hasLlmPermission, requestLlmPermission } from '../shared/llm-permission'
import { listModels, LLM_PRESETS, normalizeBaseUrl } from '../llm/client'
import { log } from '../llm/log'
import type { Status, StatusResponse } from '../shared/messages'
import { flashcardsDb } from '../flashcards/db'
import { knownSetOf, listItems, videoWords } from '../flashcards/queries'
import { coverageOf, fraction } from '../flashcards/capture'
import { parseBvidFromUrl } from '../bilibili/resolve'

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

/**
 * How much of this video you can already follow.
 *
 * Running words, not distinct ones — the words you know are the ones that
 * repeat, so the two figures are far apart and only this one predicts whether a
 * video is watchable. Below ~90% comprehension falls apart; above ~95% you can
 * follow along and infer the rest.
 */
async function coverageFor(bvid: string): Promise<{ tokens: number; types: string } | null> {
  const db = await flashcardsDb()
  const [items, counts] = await Promise.all([listItems(db), videoWords(db, bvid)])
  if (!counts.length) return null

  const coverage = coverageOf(counts, knownSetOf(items))
  return {
    tokens: fraction(coverage.knownTokens, coverage.totalTokens),
    types: `${coverage.knownTypes} of ${coverage.totalTypes} words`,
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

/**
 * A model picker whose options are whatever the server reported.
 *
 * The saved value is always offered even when the list doesn't contain it, so a
 * model that is configured but not currently loaded stays visible rather than
 * silently resetting to nothing.
 */
function ModelSelect({
  label,
  value,
  models,
  onChange,
}: {
  label: string
  value: string
  models: string[]
  onChange: (v: string) => void
}) {
  const options = Array.from(new Set([value, ...models].filter(Boolean)))

  return (
    <label class="row">
      <span>{label}</span>
      <select class="model" value={value} onChange={(e) => onChange(e.currentTarget.value)}>
        <option value="">Not set</option>
        {options.map((id) => (
          <option key={id} value={id}>
            {id}
          </option>
        ))}
      </select>
    </label>
  )
}

/**
 * The Chinese voices this browser has, best first.
 *
 * `getVoices()` comes back empty on the first call and fills in later. In a
 * popup that is the normal case rather than the edge one — the window is opened
 * and measured well inside that gap — and `voiceschanged` does not reliably fire
 * in a page this short-lived, so listening alone leaves the picker empty. Hence
 * the poll as well, which stops as soon as anything arrives.
 */
function useVoices(): SpeechSynthesisVoice[] {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>(listVoices)

  useEffect(() => {
    if (voices.length > 0) return

    const refresh = () => setVoices(listVoices())
    speechSynthesis.addEventListener('voiceschanged', refresh)
    const timer = setInterval(refresh, 150)

    return () => {
      speechSynthesis.removeEventListener('voiceschanged', refresh)
      clearInterval(timer)
    }
  }, [voices.length])

  return voices
}

export function App() {
  const voices = useVoices()
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [loaded, setLoaded] = useState(false)
  const [tabStatus, setTabStatus] = useState<TabStatus>('loading')
  const [tab, setTab] = useState<chrome.tabs.Tab | undefined>()
  const [coverage, setCoverage] = useState<{ tokens: number; types: string } | null>(null)
  const [models, setModels] = useState<string[]>([])
  const [baseUrlDraft, setBaseUrlDraft] = useState('')
  const [llmStatus, setLlmStatus] = useState<{ tone: string; message: string } | null>(null)

  useEffect(() => {
    loadSettings().then((s) => {
      setSettings(s)
      setBaseUrlDraft(s.llmBaseUrl)
      setLoaded(true)

      // Only ever on open, never as the address is typed: this is a network
      // call, and re-running it per keystroke would hammer the server.
      // Permission is checked rather than requested — asking needs a gesture.
      if (s.llmEnabled && s.llmBaseUrl) {
        void hasLlmPermission(s.llmBaseUrl).then((granted) => {
          if (granted) void refreshModels(s.llmBaseUrl)
        })
      }
    })
    currentTab().then((t) => {
      setTab(t)
      fetchTabStatus(t?.id).then(setTabStatus)

      const bvid = parseBvidFromUrl(t?.url ?? '')
      if (bvid) {
        coverageFor(bvid).then(setCoverage, (e: unknown) =>
          console.warn('[bb-subsgen] coverage failed', e),
        )
      }
    })
  }, [])

  const update = (patch: Partial<Settings>) => {
    const next = { ...settings, ...patch }
    setSettings(next)
    saveSettings(patch)
  }

  const refreshModels = async (baseUrl: string) => {
    setLlmStatus({ tone: 'busy', message: 'Connecting…' })
    try {
      const found = await listModels({ baseUrl, log })
      setModels(found)
      setLlmStatus(
        found.length
          ? { tone: 'ok', message: `Connected — ${found.length} model${found.length === 1 ? '' : 's'}.` }
          : { tone: 'bad', message: 'Connected, but the server has no models loaded.' },
      )
    } catch (e) {
      setModels([])
      setLlmStatus({ tone: 'bad', message: e instanceof Error ? e.message : String(e) })
    }
  }

  /** Same gesture rule as the reader: `permissions.request` only works in the click. */
  const connectLlm = async () => {
    const baseUrl = normalizeBaseUrl(baseUrlDraft)
    if (!baseUrl) return

    setBaseUrlDraft(baseUrl)
    update({ llmBaseUrl: baseUrl })

    if (!(await requestLlmPermission(baseUrl))) {
      setLlmStatus({
        tone: 'bad',
        message: 'Chrome needs permission to reach that address before the model can be used.',
      })
      return
    }
    await refreshModels(baseUrl)
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

  // Derived rather than stored: an intake of zero already means "no lines", so
  // a separate flag would be a second source of truth that could disagree with
  // the number beside it.
  const studyLines = settings.newSentencesPerDay > 0

  return (
    <div class="app">
      <h1>bb-subsgen</h1>

      <button
        class="open-app"
        onClick={() =>
          void chrome.tabs.create({ url: chrome.runtime.getURL('src/app/index.html') })
        }
      >
        Open flashcards
      </button>

      {coverage && (
        <p class="coverage">
          You know <strong>{Math.round(coverage.tokens * 100)}%</strong> of what is said here —{' '}
          {coverage.types}.
          {coverage.tokens >= 0.95
            ? ' Comfortable.'
            : coverage.tokens >= 0.9
              ? ' A stretch.'
              : ' Hard going.'}
        </p>
      )}

      <h2 class="section">Studying</h2>
      <Toggle
        label="Quiz mode (Alt+Q)"
        checked={settings.quizMode}
        onChange={(v) => update({ quizMode: v })}
      />
      <Toggle
        label="Study whole lines"
        checked={studyLines}
        onChange={(on) => update({ newSentencesPerDay: on ? DEFAULT_SETTINGS.newSentencesPerDay : 0 })}
      />
      {studyLines && (
        <Slider
          label="New lines / day"
          value={settings.newSentencesPerDay}
          min={1}
          max={20}
          onChange={(v) => update({ newSentencesPerDay: v })}
        />
      )}
      <p class="hint">
        Quiz mode holds back readings and translations until you hover. Every word you
        collect is studiable straight away.{' '}
        {studyLines
          ? 'Whole lines are let in a few a day, easiest first.'
          : 'Lines are still collected while you read — turn this on whenever you want them.'}
      </p>

      <>
          <label class="row">
            <span>Card voice</span>
            <select
              value={settings.speechVoice}
              onChange={(e) => update({ speechVoice: e.currentTarget.value })}
            >
              <option value="">Automatic (best available)</option>
              {voices.map((voice) => (
                <option key={voice.name} value={voice.name}>
                  {voice.name}
                  {isRemote(voice) ? ' — networked' : ''}
                </option>
              ))}
            </select>
          </label>
          {voices.length === 0 && (
            <p class="hint">No Chinese voice found on this computer, so cards cannot be spoken.</p>
          )}
          <Slider
            label="Voice speed"
            value={settings.speechRate}
            min={MIN_SPEECH_RATE}
            max={MAX_SPEECH_RATE}
            step={0.05}
            suffix="×"
            // Rounded to the step: the range input walks 0.6 up in floats, and
            // the label would otherwise read 0.8500000000000001.
            onChange={(v) => update({ speechRate: Math.round(v * 20) / 20 })}
          />
          <button class="ghost" onClick={() => speak('你好，今天天气很好。')}>
            Test voice
          </button>
          <p class="hint">
            Networked voices sound best but are synthesised by Google, so the card text
            leaves your computer and they go quiet offline — a local voice takes over when
            that happens.
          </p>
      </>

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

      <h2 class="section">Local model</h2>
      <Toggle
        label="Enabled"
        checked={settings.llmEnabled}
        onChange={(v) => update({ llmEnabled: v })}
      />

      <div class={settings.llmEnabled ? '' : 'disabled'}>
        <div class="presets">
          {LLM_PRESETS.map((preset) => (
            <button
              key={preset.baseUrl}
              class="preset"
              onClick={() => {
                setBaseUrlDraft(preset.baseUrl)
                update({ llmBaseUrl: preset.baseUrl })
              }}
            >
              {preset.label}
            </button>
          ))}
        </div>

        <label class="row">
          <span>Server</span>
          <input
            class="url"
            type="text"
            placeholder="localhost:1234"
            value={baseUrlDraft}
            onInput={(e) => setBaseUrlDraft(e.currentTarget.value)}
            // Tidied on the way out rather than as it's typed, so the cursor
            // doesn't jump while you're still halfway through an address.
            onBlur={() => {
              const tidied = normalizeBaseUrl(baseUrlDraft)
              setBaseUrlDraft(tidied)
              if (tidied !== settings.llmBaseUrl) update({ llmBaseUrl: tidied })
            }}
          />
        </label>

        <button class="connect" onClick={() => void connectLlm()}>
          Connect
        </button>
        {llmStatus && <p class={`status status-${llmStatus.tone}`}>{llmStatus.message}</p>}

        <ModelSelect
          label="Chat model"
          value={settings.llmChatModel}
          models={models}
          onChange={(v) => update({ llmChatModel: v })}
        />

        <hr class="divider" />

        <Toggle
          label="Translate subtitles"
          checked={settings.llmTranslationEnabled}
          onChange={(v) => update({ llmTranslationEnabled: v })}
        />
        <div class={settings.llmTranslationEnabled ? '' : 'disabled'}>
          <ModelSelect
            label="Translation model"
            value={settings.llmTranslationModel}
            models={models}
            onChange={(v) => update({ llmTranslationModel: v })}
          />
        </div>

        <Toggle
          label="Verbose logging"
          checked={settings.llmVerboseLog}
          onChange={(v) => update({ llmVerboseLog: v })}
        />

        <p class="hint">
          Explanations and chat use the chat model, and only when you ask for them. Subtitle
          translation runs in the background on the translation model and takes over from
          Chrome's translator once it is far enough ahead — pick something fast for it. The
          debug log is in the flashcards app, under Data.
        </p>
      </div>

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
