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
  modifierLabel,
  ReaderOptions,
  StudyingSection,
  SubtitlesSection,
} from '../settings/sections'
import { hostLabel } from '../settings/sites'
import { useSettings } from '../settings/useSettings'
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

export function App() {
  const { settings, loaded, update } = useSettings()
  const [tabStatus, setTabStatus] = useState<TabStatus>('loading')
  const [tab, setTab] = useState<chrome.tabs.Tab | undefined>()
  const [coverage, setCoverage] = useState<{ tokens: number; types: string } | null>(null)

  useEffect(() => {
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
