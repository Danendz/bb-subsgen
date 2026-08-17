// The settings themselves, grouped the way they are thought about.
//
// Every group here is rendered by both the popup and the settings tab. What is
// *not* here is the handful of controls that only make sense with a tab in
// front of you — the reader switch for the site you are on, the subtitle status
// of this video — which each host adds around these.
//
// Mounted only once settings have loaded, so nothing here has to cope with the
// defaults briefly standing in for the saved values.

import { useEffect, useState } from 'preact/hooks'
import {
  DEFAULT_SETTINGS,
  MAX_SPEECH_RATE,
  MIN_SPEECH_RATE,
  READER_MODIFIERS,
  TRANSLATION_LANGS,
  type ReaderModifier,
  type Settings,
  type TranslationLang,
  type TranslationLayout,
} from '../shared/settings'
import { isRemote, speak } from '../shared/speak'
import { hasLlmPermission, requestLlmPermission } from '../shared/llm-permission'
import { listModels, LlmError, LLM_PRESETS, normalizeBaseUrl } from '../llm/client'
import { normalizeHelperUrl } from '../youtube/site'
import { ASR_PRESETS } from '../llm/asr'
import { log } from '../llm/log'
import { Hint, ModelSelect, Section, Select, Slider, Toggle, useVoices } from './controls'

export interface SectionProps {
  settings: Settings
  update: (patch: Partial<Settings>) => void
}

const LAYOUTS: ReadonlyArray<{ code: TranslationLayout; label: string }> = [
  { code: 'inline', label: 'Same card' },
  { code: 'card', label: 'Separate card' },
]

export function StudyingSection({ settings, update }: SectionProps) {
  const voices = useVoices()

  // Derived rather than stored: an intake of zero already means "no lines", so
  // a separate flag would be a second source of truth that could disagree with
  // the number beside it.
  const studyLines = settings.newSentencesPerDay > 0

  return (
    <Section title="Studying">
      <Toggle
        label="Quiz mode (Alt+Q)"
        checked={settings.quizMode}
        onChange={(v) => update({ quizMode: v })}
      />
      <Toggle
        label="Study whole lines"
        checked={studyLines}
        onChange={(on) =>
          update({ newSentencesPerDay: on ? DEFAULT_SETTINGS.newSentencesPerDay : 0 })
        }
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
      <Hint>
        Quiz mode holds back readings and translations until you hover. Every word you collect is
        studiable straight away.{' '}
        {studyLines
          ? 'Whole lines are let in a few a day, easiest first.'
          : 'Lines are still collected while you read — turn this on whenever you want them.'}
      </Hint>

      <label class="row">
        <span class="grow">Card voice</span>
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
        <Hint>No Chinese voice found on this computer, so cards cannot be spoken.</Hint>
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
      <Hint>
        Networked voices sound best but are synthesised by Google, so the card text leaves your
        computer and they go quiet offline — a local voice takes over when that happens.
      </Hint>
    </Section>
  )
}

export function LanguageSection({ settings, update }: SectionProps) {
  return (
    <Section title="Language">
      <Select
        label="Translate to"
        value={settings.translationLang}
        options={TRANSLATION_LANGS}
        onChange={(v: TranslationLang) => update({ translationLang: v })}
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
    </Section>
  )
}

/**
 * The local model: where it is, which models it has, and what they are used for.
 *
 * Owns the connection attempt as well as the settings, because the two are the
 * same act — an address you cannot reach is not worth saving as a preference,
 * and the model pickers below have nothing to offer until it answers.
 */
export function LocalModelSection({ settings, update }: SectionProps) {
  const [models, setModels] = useState<string[]>([])
  const [draft, setDraft] = useState(settings.llmBaseUrl)
  const [status, setStatus] = useState<{ tone: string; message: string } | null>(null)

  const refreshModels = async (baseUrl: string) => {
    setStatus({ tone: 'busy', message: 'Connecting…' })
    try {
      const found = await listModels({ baseUrl, log })
      setModels(found)
      setStatus(
        found.length
          ? {
              tone: 'ok',
              message: `Connected — ${found.length} model${found.length === 1 ? '' : 's'}.`,
            }
          : { tone: 'bad', message: 'Connected, but the server has no models loaded.' },
      )
    } catch (e) {
      setModels([])
      setStatus({ tone: 'bad', message: e instanceof Error ? e.message : String(e) })
    }
  }

  useEffect(() => {
    // Only ever on open, never as the address is typed: this is a network
    // call, and re-running it per keystroke would hammer the server.
    // Permission is checked rather than requested — asking needs a gesture.
    if (!settings.llmEnabled || !settings.llmBaseUrl) return
    void hasLlmPermission(settings.llmBaseUrl).then((granted) => {
      if (granted) void refreshModels(settings.llmBaseUrl)
    })
  }, [])

  /** Same gesture rule as the reader: `permissions.request` only works in the click. */
  const connect = async () => {
    const baseUrl = normalizeBaseUrl(draft)
    if (!baseUrl) return

    setDraft(baseUrl)
    update({ llmBaseUrl: baseUrl })

    if (!(await requestLlmPermission(baseUrl))) {
      setStatus({
        tone: 'bad',
        message: 'Chrome needs permission to reach that address before the model can be used.',
      })
      return
    }
    await refreshModels(baseUrl)
  }

  return (
    <Section title="Local model">
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
                setDraft(preset.baseUrl)
                update({ llmBaseUrl: preset.baseUrl })
              }}
            >
              {preset.label}
            </button>
          ))}
        </div>

        <label class="row">
          <span class="grow">Server</span>
          <input
            class="url"
            type="text"
            placeholder="localhost:1234"
            value={draft}
            onInput={(e) => setDraft(e.currentTarget.value)}
            // Tidied on the way out rather than as it's typed, so the cursor
            // doesn't jump while you're still halfway through an address.
            onBlur={() => {
              const tidied = normalizeBaseUrl(draft)
              setDraft(tidied)
              if (tidied !== settings.llmBaseUrl) update({ llmBaseUrl: tidied })
            }}
          />
        </label>

        <button class="connect" onClick={() => void connect()}>
          Connect
        </button>
        {status && <p class={`status status-${status.tone}`}>{status.message}</p>}

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

        <Hint>
          Explanations and chat use the chat model, and only when you ask for them. Subtitle
          translation runs in the background on the translation model and takes over from Chrome's
          translator once it is far enough ahead — pick something fast for it. The debug log is on
          the flashcards Data tab.
        </Hint>
      </div>
    </Section>
  )
}

/**
 * The speech server, which supplies subtitles for videos that have none.
 *
 * Its own section rather than part of "Local model" because it is a different
 * program on a different port: LM Studio and Ollama serve chat completions and
 * neither transcribes audio. The two are related only in both being local.
 */
export function SpeechSection({ settings, update }: SectionProps) {
  const [models, setModels] = useState<string[]>([])
  const [draft, setDraft] = useState(settings.asrBaseUrl)
  const [status, setStatus] = useState<{ tone: string; message: string } | null>(null)
  const [helperDraft, setHelperDraft] = useState(settings.ytdlpBaseUrl)
  const [helperStatus, setHelperStatus] = useState<{ tone: string; message: string } | null>(null)

  /**
   * Asks the helper whether it is there.
   *
   * Its own probe rather than `listModels`: this is not an OpenAI-compatible
   * server and has no model list — it has one endpoint that returns audio and a
   * `/health` that says whether yt-dlp is reachable.
   */
  const connectHelper = async () => {
    const baseUrl = normalizeHelperUrl(helperDraft)
    if (!baseUrl) return

    setHelperDraft(baseUrl)
    update({ ytdlpBaseUrl: baseUrl })

    if (!(await requestLlmPermission(baseUrl))) {
      setHelperStatus({
        tone: 'bad',
        message: 'Chrome needs permission to reach that address before it can be used.',
      })
      return
    }

    setHelperStatus({ tone: 'busy', message: 'Connecting…' })
    try {
      const resp = await fetch(`${baseUrl}/health`)
      setHelperStatus(
        resp.ok
          ? { tone: 'ok', message: 'Connected.' }
          : { tone: 'bad', message: `The helper answered ${resp.status}.` },
      )
    } catch (e) {
      setHelperStatus({
        tone: 'bad',
        message: `Could not reach it: ${e instanceof Error ? e.message : String(e)}`,
      })
    }
  }

  const probe = async (baseUrl: string) => {
    setStatus({ tone: 'busy', message: 'Connecting…' })
    try {
      const found = await listModels({ baseUrl, log })
      setModels(found)
      setStatus({
        tone: 'ok',
        message: found.length
          ? `Connected — ${found.length} model${found.length === 1 ? '' : 's'}.`
          : 'Connected.',
      })
    } catch (e) {
      setModels([])
      // A status code means the server answered, so it is running — it simply
      // has no model list to give. whisper.cpp is the common case: it serves
      // transcriptions perfectly well without implementing /v1/models, and
      // reporting that as a failure would send you debugging a working server.
      const answered = e instanceof LlmError && e.status !== undefined
      setStatus(
        answered
          ? {
              tone: 'ok',
              message: 'Reachable. This server lists no models — type the name it was started with.',
            }
          : { tone: 'bad', message: e instanceof Error ? e.message : String(e) },
      )
    }
  }

  useEffect(() => {
    // On open only, and never as the address is typed. Permission is checked
    // rather than requested, because asking needs a gesture.
    if (!settings.asrEnabled || !settings.asrBaseUrl) return
    void hasLlmPermission(settings.asrBaseUrl).then((granted) => {
      if (granted) void probe(settings.asrBaseUrl)
    })
  }, [])

  const connect = async () => {
    const baseUrl = normalizeBaseUrl(draft)
    if (!baseUrl) return

    setDraft(baseUrl)
    update({ asrBaseUrl: baseUrl })

    if (!(await requestLlmPermission(baseUrl))) {
      setStatus({
        tone: 'bad',
        message: 'Chrome needs permission to reach that address before it can be used.',
      })
      return
    }
    await probe(baseUrl)
  }

  return (
    <Section title="Speech to text">
      <Toggle
        label="Transcribe videos with no subtitles"
        checked={settings.asrEnabled}
        onChange={(v) => update({ asrEnabled: v })}
      />

      <div class={settings.asrEnabled ? '' : 'disabled'}>
        <div class="presets">
          {ASR_PRESETS.map((preset) => (
            <button
              key={preset.baseUrl}
              class="preset"
              onClick={() => {
                setDraft(preset.baseUrl)
                update({ asrBaseUrl: preset.baseUrl })
              }}
            >
              {preset.label}
            </button>
          ))}
        </div>

        <label class="row">
          <span class="grow">Server</span>
          <input
            class="url"
            type="text"
            placeholder="localhost:8080"
            value={draft}
            onInput={(e) => setDraft(e.currentTarget.value)}
            onBlur={() => {
              const tidied = normalizeBaseUrl(draft)
              setDraft(tidied)
              if (tidied !== settings.asrBaseUrl) update({ asrBaseUrl: tidied })
            }}
          />
        </label>

        <button class="connect" onClick={() => void connect()}>
          Connect
        </button>
        {status && <p class={`status status-${status.tone}`}>{status.message}</p>}

        {/* Free text with suggestions rather than a menu: a whisper server is
            usually started with one model already loaded, and the name it
            answers to is whatever the command line said. */}
        <label class="row">
          <span class="grow">Model</span>
          <input
            class="url"
            type="text"
            list="bb-asr-models"
            placeholder="large-v3-turbo"
            value={settings.asrModel}
            onInput={(e) => update({ asrModel: e.currentTarget.value })}
          />
          <datalist id="bb-asr-models">
            {models.map((model) => (
              <option key={model} value={model} />
            ))}
          </datalist>
        </label>

        <Hint>
          Most of bangumi ships without subtitles, and this transcribes the audio so those
          episodes can still be read. It runs once per episode and the result is cached, so a
          rewatch costs nothing. Start a server with <code>tools/asr-server.sh</code> in the
          extension's repository — it is a separate program from the chat model above.
        </Hint>

        {/* A second address, and unavoidably so. Bilibili hands out a plain URL
            for a video's audio; YouTube does not hand out one at all, so on that
            site the audio has to come from a local helper that knows how to ask.
            Leaving this empty simply means YouTube is not transcribed. */}
        <label class="row">
          <span class="grow">YouTube audio helper</span>
          <input
            class="url"
            type="text"
            placeholder="localhost:8770"
            value={helperDraft}
            onInput={(e) => setHelperDraft(e.currentTarget.value)}
            onBlur={() => {
              const tidied = normalizeHelperUrl(helperDraft)
              setHelperDraft(tidied)
              if (tidied !== settings.ytdlpBaseUrl) update({ ytdlpBaseUrl: tidied })
            }}
          />
        </label>

        <button class="connect" onClick={() => void connectHelper()}>
          Connect
        </button>
        {helperStatus && (
          <p class={`status status-${helperStatus.tone}`}>{helperStatus.message}</p>
        )}

        <Hint>
          Only needed for YouTube. It serves a video's audio to the extension, because YouTube
          no longer publishes an address the browser can fetch one from. Run it with{' '}
          <code>npm run ytdlp</code> in the extension's repository, or{' '}
          <code>npm run services</code> to start it alongside the speech server above. Needs{' '}
          <code>yt-dlp</code> and <code>ffmpeg</code> installed.
        </Hint>
      </div>
    </Section>
  )
}

/**
 * How the page reader behaves once a site has it switched on.
 *
 * Which sites those are is left to the host: the popup switches the site you
 * are looking at, and the settings tab manages the whole list, because it has
 * no tab to read an origin off.
 */
export function ReaderOptions({ settings, update }: SectionProps) {
  return (
    <>
      <Select
        label="Hold key"
        value={settings.readerModifier}
        options={READER_MODIFIERS}
        onChange={(v: ReaderModifier) => update({ readerModifier: v })}
      />
      <Toggle
        label="Translate the sentence"
        checked={settings.readerSentenceTranslation}
        onChange={(v) => update({ readerSentenceTranslation: v })}
      />
    </>
  )
}

export function modifierLabel(settings: Settings): string {
  return READER_MODIFIERS.find((m) => m.code === settings.readerModifier)?.label ?? 'Shift'
}

export function SubtitlesSection({ settings, update }: SectionProps) {
  return (
    <>
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
          <Select
            label="Translation layout"
            value={settings.translationLayout}
            options={LAYOUTS}
            onChange={(v: TranslationLayout) => update({ translationLayout: v })}
          />
        </div>
      </div>
    </>
  )
}
