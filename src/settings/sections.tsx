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
import { isTranslatorSupported, translatorAvailability } from '../lang/translate'
import { packsInScope } from '../lang/packs'
import { isRemote, speak } from '../shared/speak'
import { hasLlmPermission, requestLlmPermission } from '../shared/llm-permission'
import { listModels, LlmError, LLM_PRESETS, normalizeBaseUrl } from '../llm/client'
import { normalizeHelperUrl } from '../youtube/site'
import { ASR_PRESETS } from '../llm/asr'
import { log } from '../llm/log'
import { gapExplanation, gapRow } from '../lang/gaps'
import { ComingSoon } from './ComingSoon'
import { Hint, ModelSelect, Section, Select, Slider, Toggle, useVoices } from './controls'
import { useT } from '../i18n/useT'
import { Rich } from '../i18n/Rich'
import type { Translate } from '../i18n/t'

export interface SectionProps {
  settings: Settings
  update: (patch: Partial<Settings>) => void
}

const layouts = (t: Translate): ReadonlyArray<{ code: TranslationLayout; label: string }> => [
  { code: 'inline', label: t('settings.subtitles.layoutInline') },
  { code: 'card', label: t('settings.subtitles.layoutCard') },
]

export function StudyingSection({ settings, update }: SectionProps) {
  const { t } = useT()
  // The language filter decides which controls mean anything here: a voice that
  // cannot read the deck is not a choice, and there is no sample to test it on.
  const packs = packsInScope(settings.studyLang, settings.enabledLanguages)
  const voices = useVoices(packs.map((pack) => pack.voiceLang))
  const samples = packs.map((pack) => pack.speechSample).filter(Boolean)

  // Derived rather than stored: an intake of zero already means "no lines", so
  // a separate flag would be a second source of truth that could disagree with
  // the number beside it.
  const studyLines = settings.newSentencesPerDay > 0

  return (
    <Section title={t('settings.studying.title')}>
      <Toggle
        label={t('settings.studying.quizMode')}
        checked={settings.quizMode}
        onChange={(v) => update({ quizMode: v })}
      />
      <Toggle
        label={t('settings.studying.wholeLines')}
        checked={studyLines}
        onChange={(on) =>
          update({ newSentencesPerDay: on ? DEFAULT_SETTINGS.newSentencesPerDay : 0 })
        }
      />
      {studyLines && (
        <Slider
          label={t('settings.studying.newLines')}
          value={settings.newSentencesPerDay}
          min={1}
          max={20}
          onChange={(v) => update({ newSentencesPerDay: v })}
        />
      )}
      <Hint>
        {t('settings.studying.hint')}{' '}
        {studyLines ? t('settings.studying.hintLinesOn') : t('settings.studying.hintLinesOff')}
      </Hint>

      <label class="row">
        <span class="grow">{t('settings.studying.voice')}</span>
        <select
          value={settings.speechVoice}
          onChange={(e) => update({ speechVoice: e.currentTarget.value })}
        >
          <option value="">{t('settings.studying.voiceAuto')}</option>
          {voices.map((voice) => (
            <option key={voice.name} value={voice.name}>
              {isRemote(voice)
                ? t('settings.studying.voiceNetworked', { name: voice.name })
                : voice.name}
            </option>
          ))}
        </select>
      </label>
      {voices.length === 0 && <Hint>{t('settings.studying.noVoice')}</Hint>}
      <Slider
        label={t('settings.studying.voiceSpeed')}
        value={settings.speechRate}
        min={MIN_SPEECH_RATE}
        max={MAX_SPEECH_RATE}
        step={0.05}
        suffix="×"
        // Rounded to the step: the range input walks 0.6 up in floats, and
        // the label would otherwise read 0.8500000000000001.
        onChange={(v) => update({ speechRate: Math.round(v * 20) / 20 })}
      />
      {/*
        One button per language in scope rather than one that guesses: under
        **All** there is nothing to guess with, and the point of the button is to
        hear the voice that will actually read the cards.
      */}
      {packs.map(
        (pack) =>
          pack.speechSample && (
            <button
              key={pack.code}
              class="ghost"
              onClick={() => speak(pack.speechSample, pack.voiceLang)}
            >
              {samples.length > 1
                ? t('settings.studying.testVoiceIn', { language: pack.name })
                : t('settings.studying.testVoice')}
            </button>
          ),
      )}
      <Hint>{t('settings.studying.voiceHint')}</Hint>
    </Section>
  )
}

/**
 * Whether Chrome will translate into the chosen language on this machine.
 *
 * `null` while the probe is out, so nothing is claimed before it is known. Only
 * zh→en and zh→ru are guaranteed direct; the rest are asked about, and a pair
 * Chrome will not serve is a normal answer that costs the fast lane, not the
 * feature — the local model fills the same lines.
 */
function useOnDeviceSupport(lang: TranslationLang): boolean | null {
  const [available, setAvailable] = useState<boolean | null>(null)

  useEffect(() => {
    setAvailable(null)
    if (!isTranslatorSupported()) {
      setAvailable(false)
      return
    }
    let live = true
    void translatorAvailability(lang).then((state) => {
      if (live) setAvailable(state !== 'unavailable')
    })
    return () => {
      live = false
    }
  }, [lang])

  return available
}

export function LanguageSection({ settings, update }: SectionProps) {
  const { t } = useT()
  const onDevice = useOnDeviceSupport(settings.translationLang)
  // A row renders when any language in scope has something for it to switch:
  // kana carries no tone and Japanese has no second script, so those two rows
  // are hidden rather than shown dead. **All** brings them back for Chinese.
  const packs = packsInScope(settings.studyLang, settings.enabledLanguages)

  return (
    <Section title={t('settings.language.title')}>
      <Select
        label={t('settings.language.translateTo')}
        value={settings.translationLang}
        options={TRANSLATION_LANGS}
        onChange={(v: TranslationLang) => update({ translationLang: v })}
      />
      {onDevice === false && <Hint>{t('settings.language.noOnDevice')}</Hint>}
      {packs.some((pack) => pack.displaysTones) && (
        <Toggle
          label={t('settings.language.toneColors')}
          checked={settings.showToneColors}
          onChange={(v) => update({ showToneColors: v })}
        />
      )}
      {packs.some((pack) => pack.usesTraditional) && (
        <Toggle
          label={t('settings.language.traditional')}
          checked={settings.useTraditional}
          onChange={(v) => update({ useTraditional: v })}
        />
      )}
      {/*
        A row with nothing to switch, on purpose: the point is that the setting
        you went looking for is not here yet, which an absent row cannot say.
        Only for work that is planned — what a language will never have is
        hidden by the flags above.
      */}
      {packs.flatMap((pack) =>
        pack.comingSoon.map((gap) => (
          <div class="row" key={`${pack.code}:${gap}`}>
            <span class="grow">{gapRow(pack, gap, t)}</span>
            <ComingSoon title={gapExplanation(pack, gap, t)} />
          </div>
        )),
      )}
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
  const { t } = useT()
  const [models, setModels] = useState<string[]>([])
  const [draft, setDraft] = useState(settings.llmBaseUrl)
  const [status, setStatus] = useState<{ tone: string; message: string } | null>(null)

  const refreshModels = async (baseUrl: string) => {
    setStatus({ tone: 'busy', message: t('settings.connecting') })
    try {
      const found = await listModels({ baseUrl, log })
      setModels(found)
      setStatus(
        found.length
          ? { tone: 'ok', message: t('settings.connectedModels', { count: found.length }) }
          : { tone: 'bad', message: t('settings.llm.noModels') },
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
      setStatus({ tone: 'bad', message: t('settings.llm.needsPermission') })
      return
    }
    await refreshModels(baseUrl)
  }

  return (
    <Section title={t('settings.llm.title')}>
      <Toggle
        label={t('settings.enabled')}
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
          <span class="grow">{t('settings.server')}</span>
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
          {t('settings.connect')}
        </button>
        {status && <p class={`status status-${status.tone}`}>{status.message}</p>}

        <ModelSelect
          label={t('settings.llm.chatModel')}
          value={settings.llmChatModel}
          models={models}
          onChange={(v) => update({ llmChatModel: v })}
        />

        <hr class="divider" />

        <Toggle
          label={t('settings.llm.translateSubtitles')}
          checked={settings.llmTranslationEnabled}
          onChange={(v) => update({ llmTranslationEnabled: v })}
        />
        <div class={settings.llmTranslationEnabled ? '' : 'disabled'}>
          <ModelSelect
            label={t('settings.llm.translationModel')}
            value={settings.llmTranslationModel}
            models={models}
            onChange={(v) => update({ llmTranslationModel: v })}
          />
        </div>

        <Toggle
          label={t('settings.llm.verboseLog')}
          checked={settings.llmVerboseLog}
          onChange={(v) => update({ llmVerboseLog: v })}
        />

        <Hint>{t('settings.llm.hint')}</Hint>
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
  const { t } = useT()
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
      setHelperStatus({ tone: 'bad', message: t('settings.asr.needsPermission') })
      return
    }

    setHelperStatus({ tone: 'busy', message: t('settings.connecting') })
    try {
      const resp = await fetch(`${baseUrl}/health`)
      setHelperStatus(
        resp.ok
          ? { tone: 'ok', message: t('settings.connected') }
          : {
              tone: 'bad',
              // A status code is a number that is not a quantity: interpolated
              // as one it would read "404" in English and "4 04" in French.
              message: t('settings.asr.helperAnswered', { status: String(resp.status) }),
            },
      )
    } catch (e) {
      setHelperStatus({
        tone: 'bad',
        message: t('settings.asr.unreachable', {
          error: e instanceof Error ? e.message : String(e),
        }),
      })
    }
  }

  const probe = async (baseUrl: string) => {
    setStatus({ tone: 'busy', message: t('settings.connecting') })
    try {
      const found = await listModels({ baseUrl, log })
      setModels(found)
      setStatus({
        tone: 'ok',
        message: found.length
          ? t('settings.connectedModels', { count: found.length })
          : t('settings.connected'),
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
          ? { tone: 'ok', message: t('settings.asr.noModelList') }
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
      setStatus({ tone: 'bad', message: t('settings.asr.needsPermission') })
      return
    }
    await probe(baseUrl)
  }

  return (
    <Section title={t('settings.asr.title')}>
      <Toggle
        label={t('settings.asr.enable')}
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
          <span class="grow">{t('settings.server')}</span>
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
          {t('settings.connect')}
        </button>
        {status && <p class={`status status-${status.tone}`}>{status.message}</p>}

        {/* Free text with suggestions rather than a menu: a whisper server is
            usually started with one model already loaded, and the name it
            answers to is whatever the command line said. */}
        <label class="row">
          <span class="grow">{t('settings.asr.model')}</span>
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
          <Rich
            text={t('settings.asr.hint')}
            slots={{ script: <code>tools/asr-server.sh</code> }}
          />
        </Hint>

        {/* A second address, and unavoidably so. Bilibili hands out a plain URL
            for a video's audio; YouTube does not hand out one at all, so on that
            site the audio has to come from a local helper that knows how to ask.
            Leaving this empty simply means YouTube is not transcribed. */}
        <label class="row">
          <span class="grow">{t('settings.asr.helper')}</span>
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
          {t('settings.connect')}
        </button>
        {helperStatus && <p class={`status status-${helperStatus.tone}`}>{helperStatus.message}</p>}

        <Hint>
          <Rich
            text={t('settings.asr.helperHint')}
            slots={{
              ytdlp: <code>npm run ytdlp</code>,
              services: <code>npm run services</code>,
              ytdlpBin: <code>yt-dlp</code>,
              ffmpeg: <code>ffmpeg</code>,
            }}
          />
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
  const { t } = useT()

  return (
    <>
      <Select
        label={t('settings.reader.holdKey')}
        value={settings.readerModifier}
        options={READER_MODIFIERS}
        onChange={(v: ReaderModifier) => update({ readerModifier: v })}
      />
      <Toggle
        label={t('settings.reader.translateSentence')}
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
  const { t } = useT()

  return (
    <>
      <Toggle
        label={t('settings.enabled')}
        checked={settings.enabled}
        onChange={(v) => update({ enabled: v })}
      />

      <div class={settings.enabled ? '' : 'disabled'}>
        <Toggle
          label={t('settings.subtitles.showPinyin')}
          checked={settings.showPinyin}
          onChange={(v) => update({ showPinyin: v })}
        />

        <Slider
          label={t('settings.subtitles.fontSize')}
          value={settings.fontSize}
          min={18}
          max={48}
          suffix="px"
          onChange={(v) => update({ fontSize: v })}
        />
        <Slider
          label={t('settings.subtitles.wordSpacing')}
          value={settings.wordSpacing}
          min={0}
          max={24}
          suffix="px"
          onChange={(v) => update({ wordSpacing: v })}
        />
        <Slider
          label={t('settings.subtitles.backdrop')}
          value={settings.backdropOpacity}
          min={0}
          max={100}
          suffix="%"
          onChange={(v) => update({ backdropOpacity: v })}
        />

        <Slider
          label={t('settings.subtitles.height')}
          value={settings.positionPercent}
          min={0}
          max={85}
          suffix="%"
          onChange={(v) => update({ positionPercent: v })}
        />
        <Toggle
          label={t('settings.subtitles.lift')}
          checked={settings.liftAboveControls}
          onChange={(v) => update({ liftAboveControls: v })}
        />

        <hr class="divider" />

        <Toggle
          label={t('settings.subtitles.translation')}
          checked={settings.showTranslation}
          onChange={(v) => update({ showTranslation: v })}
        />

        <div class={settings.showTranslation ? '' : 'disabled'}>
          <Slider
            label={t('settings.subtitles.translationSize')}
            value={settings.translationFontSize}
            min={10}
            max={32}
            suffix="px"
            onChange={(v) => update({ translationFontSize: v })}
          />
          <Select
            label={t('settings.subtitles.translationLayout')}
            value={settings.translationLayout}
            options={layouts(t)}
            onChange={(v: TranslationLayout) => update({ translationLayout: v })}
          />
        </div>
      </div>
    </>
  )
}
