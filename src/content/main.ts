import { mount } from './mount'
import {
  renderCue,
  clearCue,
  setTranslation,
  setGeometry,
  setProgress,
  translationWithheld,
  type CueView,
} from './overlay'
import { watchPlayback } from './sync'
import { attachHover } from './hover'
import { withUserActivation } from './activation'
import { runTranslationPass } from './translations'
import { watchControls, forwardHoverToPlayer, type PlayerGeometry } from './controls'
import { isWaiting, progressView, type ProgressState } from './progress'
import { parseBvidFromUrl, fetchVideoInfo, watchBvidChange } from '../bilibili/resolve'
import { fetchSubtitles, type Cue, type SubtitleTrack } from '../bilibili/subtitles'
import { segment, type Token } from '../lang/segment'
import { loadWords, dropLegacyPageDefsDb } from '../lang/dict'
import { lookupDefs } from '../shared/dict-client'
import {
  captureSentence,
  createExposureBuffer,
  recordSignal,
  watchKnownSet,
} from '../shared/flashcards-client'
import { hanWords, isCapturableText, shouldCaptureLine } from '../flashcards/capture'
import type { Context } from '../flashcards/types'
import { createTranslator, isTranslatorSupported, translatorAvailability } from '../lang/translate'
import {
  loadSettings,
  onSettingsChanged,
  TRANSLATION_LANGS,
  type TranslationLang,
} from '../shared/settings'
import { isGetStatusMessage, type Status } from '../shared/messages'

console.log('[bb-subsgen] content script loaded', location.href)

interface InitialState {
  videoData?: {
    aid?: number
    cid?: number
    bvid?: string
    pages?: Array<{ cid: number }>
    subtitle?: { list?: SubtitleTrack[] }
  }
}

declare global {
  interface Window {
    __INITIAL_STATE__?: InitialState
  }
}

/** Cues plus the video they belong to — the bvid is what every capture is filed under. */
async function loadCuesForCurrentVideo(): Promise<{ cues: Cue[]; bvid: string } | null> {
  const bvid = parseBvidFromUrl(location.href)
  if (!bvid) return null

  const info = await fetchVideoInfo(bvid)
  if (!info) {
    console.warn('[bb-subsgen] could not resolve aid/cid for', bvid)
    return null
  }
  console.log('[bb-subsgen] resolved', bvid, info)

  const cues = await fetchSubtitles(
    { aid: info.aid, cid: info.cid, bvid },
    window.__INITIAL_STATE__?.videoData?.subtitle?.list,
  )
  return cues ? { cues, bvid } : null
}

function labelFor(lang: TranslationLang): string {
  return TRANSLATION_LANGS.find((l) => l.code === lang)?.label ?? lang
}

interface TranslateTrackDeps {
  lang: TranslationLang
  texts: string[]
  currentIndex: () => number
  /** Fires only when a language pack actually has to be fetched. */
  onDownload: (fraction: number) => void
  /** The translator exists; from here on the pass is the thing to report. */
  onReady: () => void
  onResult: (index: number, translated: string) => void
  signal: AbortSignal
}

/**
 * Acquires a translator and runs the whole track through it in the background.
 *
 * Silently does nothing where the API doesn't exist (non-Chrome, Chrome < 138,
 * mobile) — an absent translated line is the correct fallback, never a broken one.
 */
async function translateTrack({
  lang,
  texts,
  currentIndex,
  onDownload,
  onReady,
  onResult,
  signal,
}: TranslateTrackDeps): Promise<void> {
  if (!isTranslatorSupported()) {
    console.log(
      '[bb-subsgen] Translator API not exposed here — skipping translation.',
      'Needs desktop Chrome 138+.',
    )
    return
  }
  console.log(`[bb-subsgen] zh→${lang} availability:`, await translatorAvailability(lang))

  let translator
  try {
    // Needs a user gesture on the page; resolves on the first click or keypress.
    // The first run for a language also downloads its pack.
    translator = await withUserActivation(() => createTranslator(lang, onDownload), { signal })
  } catch (e) {
    if (!signal.aborted) console.warn('[bb-subsgen] could not create translator', e)
    return
  }
  if (signal.aborted) return
  onReady()

  console.log('[bb-subsgen] translating', texts.length, 'cues to', lang)
  await runTranslationPass({ texts, translator, currentIndex, onResult, signal })
}

async function main() {
  // Definitions now come from the service worker, so nothing here opens a
  // database — clear the one older versions left under bilibili.com's origin.
  dropLegacyPageDefsDb()

  const [words, initialSettings] = await Promise.all([loadWords(), loadSettings()])
  let settings = initialSettings
  let stopMount: (() => void) | null = null
  let rerenderCurrentCue: (() => void) | null = null
  let startTranslation: (() => void) | null = null
  let translationAbort: AbortController | null = null
  // Per target language, each inner map keyed by cue index — which is also what
  // v2 word alignment will attach to. Keeping a map per language means switching
  // back to one already translated renders instantly instead of re-running the pass.
  const translations = new Map<TranslationLang, Map<number, string>>()
  let status: Status = 'loading'
  // Mirrored from the worker; drives what the overlay stops annotating and
  // which lines are still worth capturing.
  let known = new Set<string>()
  watchKnownSet((next) => {
    known = next
  })

  // Review's jump-back link carries this, so arriving at a line you are being
  // quizzed on doesn't hand you the answer. Scoped to the page load rather than
  // to the stored setting: it is this visit that is a test, not every visit.
  const quizForThisVisit = new URLSearchParams(location.search).get('bbq') === '1'
  const quizMode = () => settings.quizMode || quizForThisVisit

  const cacheFor = (lang: TranslationLang): Map<number, string> => {
    let cache = translations.get(lang)
    if (!cache) {
      cache = new Map()
      translations.set(lang, cache)
    }
    return cache
  }

  const stopTranslation = () => {
    translationAbort?.abort()
    translationAbort = null
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!isGetStatusMessage(msg)) return
    sendResponse({ status })
  })

  const loadCurrentVideo = async () => {
    stopMount?.()
    stopMount = null
    rerenderCurrentCue = null
    startTranslation = null
    stopTranslation()
    translations.clear()
    status = 'loading'
    if (!settings.enabled) return

    const loaded = await loadCuesForCurrentVideo()
    if (!loaded) {
      status = 'no-track'
      console.log('[bb-subsgen] no subtitle track for this video')
      return
    }
    const { cues, bvid } = loaded
    status = 'active'

    stopMount = mount(({ shadowRoot, video, container }) => {
      let lastIndex = -1
      // Kept beside lastIndex so the cue's words are segmented once per cue,
      // rather than again for every capture that needs them.
      let currentTokens: Token[] = []
      // Per line, reset on every cue change: how long its cards stayed open,
      // and whether it has already been kept.
      let engagedMs = 0
      let captured = false

      const buffer = createExposureBuffer({ bvid, title: document.title, url: location.href })

      /**
       * Where a word or line was met, frozen for the card.
       *
       * The translation is whatever has landed by now: the pass runs ahead of
       * playback so it is usually there, but a line captured in the first
       * seconds of a video may snapshot an empty one. The app backfills those
       * rather than the capture path blocking on a translator.
       */
      const contextFor = (index: number): Context => ({
        text: cues[index].text,
        translation: cacheFor(settings.translationLang).get(index) ?? '',
        bvid,
        start: cues[index].start,
        url: location.href,
        title: document.title,
        at: Date.now(),
      })

      const stopHover = attachHover({
        shadowRoot,
        video,
        lookup: lookupDefs,
        isTraditional: () => settings.useTraditional,
        showToneColors: () => settings.showToneColors,
        currentContext: () => (lastIndex >= 0 ? contextFor(lastIndex) : null),
        known: () => known,

        // Going looking for a translation that was withheld because you knew
        // every word is an unambiguous "I couldn't read that" — no threshold to
        // tune, so it acts at once.
        onLookup: () => {
          if (translationWithheld(cueView())) captureCurrentLine()
        },

        // Otherwise the evidence is weaker and cumulative: dwelling long enough
        // on one line suggests something was off. The threshold is a guess, so
        // every sample is logged raw and it can be moved to wherever the real
        // "I'm stuck" pauses turn out to sit.
        onLookupEnd: (ms) => {
          if (lastIndex < 0) return
          engagedMs += ms
          const withheld = translationWithheld(cueView())
          const overThreshold = engagedMs >= settings.struggleThresholdMs
          if (overThreshold) captureCurrentLine()
          recordSignal({
            at: Date.now(),
            bvid,
            start: cues[lastIndex].start,
            ms,
            hidden: withheld,
            captured,
          })
        },
      })
      let progress: ProgressState = { phase: 'idle' }
      // Blank cues are never translated, so they'd otherwise make the pass
      // look permanently unfinished.
      const translatable = cues.filter((cue) => cue.text.trim()).length

      const renderProgress = () => {
        const cache = cacheFor(settings.translationLang)
        setProgress(
          shadowRoot,
          progressView(progress, isWaiting(lastIndex, (index) => cache.has(index))),
        )
      }

      const cueView = (): CueView => ({
        tokens: currentTokens,
        translation: cacheFor(settings.translationLang).get(lastIndex) ?? '',
        known,
        quiz: quizMode(),
      })

      const render = () => {
        if (lastIndex === -1) {
          currentTokens = []
          clearCue(shadowRoot)
          return
        }
        currentTokens = segment(cues[lastIndex].text, words)
        renderCue(shadowRoot, cueView(), settings)
      }

      /**
       * Counts a line as seen, and keeps it if it still has something to teach.
       *
       * One rule for every level: a line qualifies when it contains a word you
       * don't yet know. As a beginner that is nearly every line, which is the
       * point — you cannot pause every four seconds to curate. What stops this
       * flooding the deck is that captures land in the intake pool and are
       * rationed out, not that capture is stingy.
       */
      const onCueShown = () => {
        engagedMs = 0
        captured = false
        if (lastIndex < 0) return

        const seen = hanWords(currentTokens)
        buffer.line(seen)

        const { text } = cues[lastIndex]
        if (!isCapturableText(text) || !shouldCaptureLine(seen, known)) return
        captureSentence(text, contextFor(lastIndex))
        captured = true
      }

      /**
       * Keeps the line on screen, once for whatever reason.
       *
       * Lines that already qualified on vocabulary were taken by `onCueShown`;
       * this is the other path in, for a line whose words you all know but
       * whose grammar you evidently didn't. Those are the most valuable
       * sentences in the pool, and nothing else in the design would find them.
       */
      const captureCurrentLine = () => {
        if (captured || lastIndex < 0) return
        const { text } = cues[lastIndex]
        if (!isCapturableText(text)) return
        captureSentence(text, contextFor(lastIndex))
        captured = true
      }

      // Re-applied on every settings change, since watchControls only emits
      // when the player changes — toggling the setting off has to take effect
      // without waiting for the bar to move. The floor is not gated on the
      // setting: rendering the card below the video is a bug, not a preference.
      let geometry: PlayerGeometry = { floor: 0, lift: 0 }
      const applyGeometry = () =>
        setGeometry(shadowRoot, {
          floor: geometry.floor,
          lift: settings.liftAboveControls ? geometry.lift : 0,
        })
      const stopControls = watchControls(container, video, shadowRoot.host, (next) => {
        geometry = next
        applyGeometry()
      })
      // Hovering a character shouldn't make the player's own timeline vanish.
      const stopForward = forwardHoverToPlayer(container, shadowRoot.host)

      rerenderCurrentCue = () => {
        if (!settings.showTranslation) progress = { phase: 'idle' }
        render()
        applyGeometry()
        renderProgress()
      }

      // Fires only when the active cue actually changes, which is why capture
      // hangs off it rather than off render() — render also runs on every
      // settings change, and would count the same line again each time.
      const stopSync = watchPlayback(video, cues, (index) => {
        lastIndex = index
        render()
        renderProgress()
        onCueShown()
      })

      startTranslation = () => {
        if (!settings.showTranslation || translationAbort) return
        // Captured, not re-read: a result arriving after the user switches
        // language belongs to the language the pass was started for.
        const lang = settings.translationLang
        const cache = cacheFor(lang)
        const controller = new AbortController()
        translationAbort = controller

        progress = { phase: 'pass', done: cache.size, total: translatable }
        renderProgress()

        void translateTrack({
          lang,
          // Blanking already-translated cues makes the pass skip them, so
          // toggling the setting off and back on — or switching language and
          // back — doesn't redo finished work.
          texts: cues.map((cue, index) => (cache.has(index) ? '' : cue.text)),
          currentIndex: () => lastIndex,
          onDownload: (fraction) => {
            progress = { phase: 'download', label: labelFor(lang), fraction }
            renderProgress()
          },
          onReady: () => {
            progress = { phase: 'pass', done: cache.size, total: translatable }
            renderProgress()
          },
          onResult: (index, translated) => {
            cache.set(index, translated)
            if (lang !== settings.translationLang) return // superseded mid-flight
            if (index === lastIndex) setTranslation(shadowRoot, translated)
            progress = { phase: 'pass', done: cache.size, total: translatable }
            renderProgress()
          },
          signal: controller.signal,
        })
      }
      startTranslation()

      return () => {
        // First, so the last few lines of the session are posted before the
        // listeners that would have flushed them are gone.
        buffer.stop()
        stopHover()
        stopSync()
        stopControls()
        stopForward()
      }
    })
  }

  watchBvidChange(loadCurrentVideo)
  onSettingsChanged((next) => {
    const enabledChanged = next.enabled !== settings.enabled
    const translationToggled = next.showTranslation !== settings.showTranslation
    const langChanged = next.translationLang !== settings.translationLang
    settings = next
    if (enabledChanged) {
      loadCurrentVideo()
      return
    }
    if (langChanged) {
      // The caches survive, so switching back to a finished language is instant.
      stopTranslation()
      startTranslation?.()
    } else if (translationToggled) {
      if (next.showTranslation) startTranslation?.()
      else stopTranslation()
    }
    rerenderCurrentCue?.()
  })

  await loadCurrentVideo()
}

main()
