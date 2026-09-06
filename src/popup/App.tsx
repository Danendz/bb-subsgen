// The popup: the settings form, plus the things that only make sense with a
// tab in front of you.
//
// Every group of settings here is the same component the settings tab renders
// (src/settings/). What is local to this file is what needs the current tab —
// how much of this video you can follow, whether the overlay found subtitles,
// and the reader switch for the site you are actually on.
//
// The layout now draws that line rather than only describing it: the tab-bound
// half is pinned above a section rail, and the settings groups sit in the pane
// beside it. Which section is open is local state, so every open starts at the
// same place — the popup is opened to glance at this video far more often than
// to change a setting, and a remembered section would hide the glance.

import { useEffect, useState } from 'preact/hooks'
import {
  disableReaderFor,
  enableReaderFor,
  originOf,
  readerEnabledFor,
} from '../shared/reader-sites'
import { Hint, Section, Toggle } from '../settings/controls'
import { SectionRail, type RailItem } from '../settings/SectionRail'
import {
  LanguageSection,
  LocalModelSection,
  SpeechSection,
  modifierLabel,
  ReaderOptions,
  StudyingSection,
  SubtitlesSection,
} from '../settings/sections'
import { LanguageFilter } from '../settings/LanguageFilter'
import { hostLabel } from '../settings/sites'
import { useSettings } from '../settings/useSettings'
import type {
  GetPassStatusMessage,
  GetTranscriptStatusMessage,
  PassStatusResponse,
  Status,
  StatusResponse,
  TranscriptStatusResponse,
} from '../shared/messages'
import type { PassStatus } from '../background/llm-translate'
import type { TranscriptStatus } from '../background/asr-pass'
import { passProgressView, transcriptProgressView } from '../llm/progress'
import { flashcardsDb } from '../flashcards/db'
import { knownSetOf, listItems, videoWords } from '../flashcards/queries'
import { coverageOf, fraction } from '../flashcards/capture'
import { parseVideoIdFromUrl } from '../bilibili/resolve'
import { dictStatus } from '../shared/dict-client'
import { loadSettings, resolveStudyLang } from '../shared/settings'
import { useT } from '../i18n/useT'
import { Rich } from '../i18n/Rich'
import type { Translate } from '../i18n/t'
import type { MessageKey } from '../i18n/keys'

type TabStatus = Status | 'no-video'

const STATUS_KEY: Record<TabStatus, MessageKey> = {
  loading: 'popup.status.loading',
  'no-track': 'popup.status.noTrack',
  active: 'popup.status.active',
  'no-video': 'popup.status.noVideo',
  'no-dictionary': 'popup.status.noDictionary',
}

async function currentTab(): Promise<chrome.tabs.Tab | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  return tab
}

async function fetchTabStatus(tabId: number | undefined): Promise<TabStatus> {
  if (!tabId) return 'no-video'
  try {
    const response = (await chrome.tabs.sendMessage(tabId, {
      type: 'bb-subsgen:get-status',
    })) as StatusResponse | undefined
    return response?.status ?? 'no-video'
  } catch {
    return 'no-video' // no content script on this tab
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
async function coverageFor(
  videoId: string,
  t: Translate,
): Promise<{ tokens: number; types: string } | null> {
  const db = await flashcardsDb()
  const lang = resolveStudyLang(await loadSettings())
  const [items, counts] = await Promise.all([listItems(db, lang), videoWords(db, videoId, lang)])
  // Also how a video watched in another language reads as no coverage at all,
  // rather than as 0%.
  if (!counts.length) return null

  const coverage = coverageOf(counts, knownSetOf(items))
  return {
    tokens: fraction(coverage.knownTokens, coverage.totalTokens),
    types: t('popup.coverageTypes', {
      known: coverage.knownTypes,
      total: coverage.totalTypes,
    }),
  }
}

/** How often the popup re-asks the worker how far the pass has got. */
const PASS_POLL_MS = 1000

async function fetchPassStatus(tabId: number | undefined): Promise<PassStatus | null> {
  if (!tabId) return null
  try {
    const response = (await chrome.runtime.sendMessage({
      type: 'bb-subsgen:llm-pass-status',
      tabId,
    } satisfies GetPassStatusMessage)) as PassStatusResponse | undefined
    return response?.status ?? null
  } catch {
    return null // the worker was asleep, which is itself "no pass running"
  }
}

/**
 * The model's progress through this video's subtitles.
 *
 * Polled rather than pushed: a pass runs for tens of minutes in the worker and
 * the popup lives for seconds, so there is no subscription worth setting up.
 * Batches land every ten seconds or so, which a one-second poll tracks closely
 * enough while costing nothing measurable.
 */
function PassProgress({ tabId }: { tabId: number | undefined }) {
  const { t } = useT()
  const [status, setStatus] = useState<PassStatus | null>(null)

  useEffect(() => {
    let live = true
    const tick = () => {
      void fetchPassStatus(tabId).then((next) => {
        if (live) setStatus(next)
      })
    }
    tick()
    const timer = setInterval(tick, PASS_POLL_MS)
    return () => {
      live = false
      clearInterval(timer)
    }
  }, [tabId])

  // Nothing running is nothing to show. A finished pass drops its state in the
  // worker, so this is also what "done" looks like.
  if (!status) return null

  const view = passProgressView(status, t)
  return (
    <div class="pass-progress">
      <div class="pass-progress-head">
        <span class="pass-progress-model" title={status.model}>
          {view.label}
        </span>
        <span class="pass-progress-count">{view.count}</span>
      </div>
      <div
        class="pass-progress-track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={status.total}
        aria-valuenow={status.translated}
        aria-label={view.label}
      >
        <div class="pass-progress-fill" style={{ width: `${view.fraction * 100}%` }} />
      </div>
    </div>
  )
}

/**
 * Whether a remembered run is about the video the tab is actually on.
 *
 * A stopped run is kept per tab so it can still be retried after a reload, which
 * means it outlives navigating to the next episode — and reporting the previous
 * one's failure here would be misleading.
 *
 * A season URL is let through rather than hidden on a guess: `/bangumi/play/ss…`
 * names a season, and the episode it settles on is decided by an API call this
 * has no part in, so the two ids cannot be compared.
 */
function isCurrentVideo(status: TranscriptStatus, videoId: string | null): boolean {
  if (!videoId) return false
  if (videoId.startsWith('ss')) return true
  return status.videoId === videoId
}

async function fetchTranscriptStatus(tabId: number | undefined): Promise<TranscriptStatus | null> {
  if (!tabId) return null
  try {
    const response = (await chrome.runtime.sendMessage({
      type: 'bb-subsgen:asr-status',
      tabId,
    } satisfies GetTranscriptStatusMessage)) as TranscriptStatusResponse | undefined
    return response?.status ?? null
  } catch {
    return null // the worker was asleep, which is itself "nothing running"
  }
}

/**
 * The speech model's progress through this video, and what to do if it stopped.
 *
 * Polled on the same interval as `PassProgress`, and for the same reason. It
 * earns its place beside the overlay's own bar by covering what the overlay
 * cannot: the notice dismissed, the tab in the background, the video fullscreen.
 */
function AsrProgress({ tabId, videoId }: { tabId: number | undefined; videoId: string | null }) {
  const { t } = useT()
  const [status, setStatus] = useState<TranscriptStatus | null>(null)
  const [retrying, setRetrying] = useState(false)

  useEffect(() => {
    let live = true
    const tick = () => {
      void fetchTranscriptStatus(tabId).then((next) => {
        if (!live) return
        setStatus(next)
        // Cleared once the worker agrees something is going again, rather than
        // on the click: the run takes a moment to start, and a button that
        // re-enables before then invites a second retry that cancels the first.
        if (next?.running) setRetrying(false)
      })
    }
    tick()
    const timer = setInterval(tick, PASS_POLL_MS)
    return () => {
      live = false
      clearInterval(timer)
    }
  }, [tabId])

  if (!status || !isCurrentVideo(status, videoId)) return null

  const view = transcriptProgressView(status, t)
  return (
    <div class={`pass-progress asr-progress${view.stopped ? ' stopped' : ''}`}>
      <div class="pass-progress-head">
        <span class="pass-progress-model" title={status.model}>
          {view.label}
        </span>
        <span class="pass-progress-count">{view.count}</span>
      </div>
      <div
        class="pass-progress-track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={status.total}
        aria-valuenow={status.done}
        aria-label={view.label}
      >
        <div class="pass-progress-fill" style={{ width: `${view.fraction * 100}%` }} />
      </div>
      {view.detail && <p class="asr-progress-error">{view.detail}</p>}
      {view.stopped && (
        <button
          class="asr-retry"
          disabled={retrying}
          onClick={() => {
            setRetrying(true)
            void chrome.runtime.sendMessage({ type: 'bb-subsgen:asr-retry', tabId })
          }}
        >
          {retrying ? t('popup.retrying') : t('popup.retry')}
        </button>
      )}
    </div>
  )
}

/**
 * The same four sections the settings tab rails, minus Dictionaries — managing a
 * dictionary is a download and a wizard, neither of which belongs in a window
 * that closes when you look away.
 */
type PopupSection = 'general' | 'studying' | 'language' | 'models'

const sections = (t: Translate): readonly RailItem<PopupSection>[] => [
  { slug: 'general', label: t('settings.rail.general') },
  { slug: 'studying', label: t('settings.studying.title') },
  { slug: 'language', label: t('settings.language.title') },
  { slug: 'models', label: t('settings.rail.models') },
]

export function App() {
  const { t, ready } = useT()
  const { settings, loaded, update } = useSettings()
  const [section, setSection] = useState<PopupSection>('general')
  const [tabStatus, setTabStatus] = useState<TabStatus>('loading')
  const [tab, setTab] = useState<chrome.tabs.Tab | undefined>()
  const [coverage, setCoverage] = useState<{ tokens: number; types: string } | null>(null)
  const [videoId, setVideoId] = useState<string | null>(null)
  const [needsSetup, setNeedsSetup] = useState(false)

  useEffect(() => {
    if (!settings.enabledLanguages.length) {
      setNeedsSetup(true)
      return
    }
    dictStatus().then((languages) => {
      setNeedsSetup(languages.some((l) => !l.installed))
    })
  }, [settings.enabledLanguages.join(',')])

  useEffect(() => {
    // Named rather than `t`: this file's `t` is the translator.
    currentTab().then((active) => {
      setTab(active)
      fetchTabStatus(active?.id).then(setTabStatus)

      const id = parseVideoIdFromUrl(active?.url ?? '')
      setVideoId(id)
      if (id) {
        coverageFor(id, t).then(setCoverage, (e: unknown) =>
          console.warn('[bb-subsgen] coverage failed', e),
        )
      }
    })
  }, [])

  const origin = originOf(tab?.url)
  const readerOn = origin ? readerEnabledFor(settings, origin) : false

  /**
   * Chrome only prompts for an optional permission inside a user gesture, so
   * this has to run in the click handler itself — it can't be deferred to the
   * worker or awaited behind anything else. Both helpers write `readerOrigins`
   * themselves, and the switch follows from the storage change they cause.
   */
  const toggleReader = async (on: boolean) => {
    if (!origin) return

    if (on) {
      const granted = await enableReaderFor(origin)
      if (!granted) return // prompt declined; leave the switch where it was
      // A declared script only injects on load, so the page it was just
      // enabled for needs a reload before the reader is actually there.
      if (tab?.id) chrome.tabs.reload(tab.id)
    } else {
      await disableReaderFor(origin)
    }
  }

  // Also waits on the language: the popup's whole chrome is translated, and a
  // frame of English before the real locale lands is what `ready` prevents.
  if (!loaded || !ready) return null

  if (needsSetup) {
    return (
      <div class="app">
        <h1>bb-subsgen</h1>
        <p>
          {settings.enabledLanguages.length ? t('popup.needsDictionary') : t('popup.noLanguage')}
        </p>
        <button
          class="primary open-app"
          onClick={() =>
            void chrome.tabs.create({
              url: chrome.runtime.getURL('src/app/index.html') + '#/setup',
            })
          }
        >
          {t('popup.goToSetup')}
        </button>
      </div>
    )
  }

  return (
    <div class="app">
      <div class="pinned">
        <h1>bb-subsgen</h1>

        <button
          class="primary open-app"
          onClick={() =>
            void chrome.tabs.create({ url: chrome.runtime.getURL('src/app/index.html') })
          }
        >
          {t('popup.openApp')}
        </button>

        <LanguageFilter />

        {coverage && (
          <p class="coverage">
            <Rich
              text={t('popup.coverage')}
              slots={{
                percent: (
                  <strong>
                    {t('popup.coveragePercent', { percent: Math.round(coverage.tokens * 100) })}
                  </strong>
                ),
                types: coverage.types,
              }}
            />{' '}
            {t(
              coverage.tokens >= 0.95
                ? 'popup.verdict.comfortable'
                : coverage.tokens >= 0.9
                  ? 'popup.verdict.stretch'
                  : 'popup.verdict.hard',
            )}
          </p>
        )}

        <p class={`status status-${tabStatus}`}>{t(STATUS_KEY[tabStatus])}</p>
        <AsrProgress tabId={tab?.id} videoId={videoId} />
        <PassProgress tabId={tab?.id} />

        {origin ? (
          <Toggle
            label={t('popup.readerOn', { host: hostLabel(origin) })}
            checked={readerOn}
            onChange={(v) => void toggleReader(v)}
          />
        ) : (
          <Hint>{t('popup.readerUnavailable')}</Hint>
        )}
      </div>

      <div class="section-layout">
        <SectionRail items={sections(t)} active={section} onSelect={setSection} />

        <div class="section-pane">
          {section === 'general' && (
            <>
              <Section title={t('settings.pageReader.title')}>
                {origin ? (
                  <>
                    <div class={readerOn ? '' : 'disabled'}>
                      <ReaderOptions settings={settings} update={update} />
                    </div>
                    <Hint>{t('settings.pageReader.hint', { key: modifierLabel(settings) })}</Hint>
                  </>
                ) : (
                  <Hint>{t('popup.readerUnavailable')}</Hint>
                )}
              </Section>

              <Section title={t('settings.subtitles.title')}>
                <SubtitlesSection settings={settings} update={update} />
                <Hint>{t('settings.subtitles.hint')}</Hint>
              </Section>
            </>
          )}

          {section === 'studying' && <StudyingSection settings={settings} update={update} />}

          {section === 'language' && <LanguageSection settings={settings} update={update} />}

          {section === 'models' && (
            <>
              <LocalModelSection settings={settings} update={update} />
              <SpeechSection settings={settings} update={update} />
            </>
          )}
        </div>
      </div>
    </div>
  )
}
