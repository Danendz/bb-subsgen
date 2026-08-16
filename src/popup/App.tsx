// The popup: the settings form, plus the things that only make sense with a
// tab in front of you.
//
// Every group of settings here is the same component the settings tab renders
// (src/settings/). What is local to this file is what needs the current tab —
// how much of this video you can follow, whether the overlay found subtitles,
// and the reader switch for the site you are actually on.

import { useEffect, useState } from 'preact/hooks'
import { disableReaderFor, enableReaderFor, originOf, readerEnabledFor } from '../shared/reader-sites'
import { Hint, Section, Toggle } from '../settings/controls'
import {
  LanguageSection,
  LocalModelSection,
  SpeechSection,
  modifierLabel,
  ReaderOptions,
  StudyingSection,
  SubtitlesSection,
} from '../settings/sections'
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
async function coverageFor(videoId: string): Promise<{ tokens: number; types: string } | null> {
  const db = await flashcardsDb()
  const [items, counts] = await Promise.all([listItems(db), videoWords(db, videoId)])
  if (!counts.length) return null

  const coverage = coverageOf(counts, knownSetOf(items))
  return {
    tokens: fraction(coverage.knownTokens, coverage.totalTokens),
    types: `${coverage.knownTypes} of ${coverage.totalTypes} words`,
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

  const view = passProgressView(status)
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
function AsrProgress({
  tabId,
  videoId,
}: {
  tabId: number | undefined
  videoId: string | null
}) {
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

  const view = transcriptProgressView(status)
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
          {retrying ? 'Retrying…' : 'Retry the missing parts'}
        </button>
      )}
    </div>
  )
}

export function App() {
  const { settings, loaded, update } = useSettings()
  const [tabStatus, setTabStatus] = useState<TabStatus>('loading')
  const [tab, setTab] = useState<chrome.tabs.Tab | undefined>()
  const [coverage, setCoverage] = useState<{ tokens: number; types: string } | null>(null)
  const [videoId, setVideoId] = useState<string | null>(null)

  useEffect(() => {
    currentTab().then((t) => {
      setTab(t)
      fetchTabStatus(t?.id).then(setTabStatus)

      const id = parseVideoIdFromUrl(t?.url ?? '')
      setVideoId(id)
      if (id) {
        coverageFor(id).then(setCoverage, (e: unknown) =>
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

  if (!loaded) return null

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

      <StudyingSection settings={settings} update={update} />
      <LanguageSection settings={settings} update={update} />
      <LocalModelSection settings={settings} update={update} />
      <SpeechSection settings={settings} update={update} />

      <Section title="Page reader">
        {origin ? (
          <>
            <Toggle
              label={hostLabel(origin)}
              checked={readerOn}
              onChange={(v) => void toggleReader(v)}
            />
            <div class={readerOn ? '' : 'disabled'}>
              <ReaderOptions settings={settings} update={update} />
            </div>
            <Hint>
              Hold {modifierLabel(settings)} and point at a word; click it for characters. Select
              Chinese text for a phrase card.
            </Hint>
          </>
        ) : (
          <Hint>The reader can't run on this page.</Hint>
        )}
      </Section>

      <Section title="Bilibili subtitles">
        <p class={`status status-${tabStatus}`}>{STATUS_LABEL[tabStatus]}</p>
        <AsrProgress tabId={tab?.id} videoId={videoId} />
        <PassProgress tabId={tab?.id} />
        <SubtitlesSection settings={settings} update={update} />
      </Section>

      <Hint>Shortcuts: Alt+P toggles pinyin, Alt+S cycles font size — for fullscreen.</Hint>

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
