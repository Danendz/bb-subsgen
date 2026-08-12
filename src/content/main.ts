import { mount } from './mount'
import { renderCue, clearCue, setTranslation, setGeometry, setProgress } from './overlay'
import { watchPlayback } from './sync'
import { attachHover } from './hover'
import { withUserActivation } from './activation'
import { runTranslationPass } from './translations'
import { watchControls, forwardHoverToPlayer, type PlayerGeometry } from './controls'
import { isWaiting, progressView, type ProgressState } from './progress'
import { parseBvidFromUrl, fetchVideoInfo, watchBvidChange } from '../bilibili/resolve'
import { fetchSubtitles, type Cue, type SubtitleTrack } from '../bilibili/subtitles'
import { segment } from '../lang/segment'
import { loadWords, initDefs } from '../lang/dict'
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

async function loadCuesForCurrentVideo(): Promise<Cue[] | null> {
  const bvid = parseBvidFromUrl(location.href)
  if (!bvid) return null

  const info = await fetchVideoInfo(bvid)
  if (!info) {
    console.warn('[bb-subsgen] could not resolve aid/cid for', bvid)
    return null
  }
  console.log('[bb-subsgen] resolved', bvid, info)

  return fetchSubtitles(
    { aid: info.aid, cid: info.cid, bvid },
    window.__INITIAL_STATE__?.videoData?.subtitle?.list,
  )
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
  const [words, lookupDefs, initialSettings] = await Promise.all([
    loadWords(),
    initDefs(),
    loadSettings(),
  ])
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

    const cues = await loadCuesForCurrentVideo()
    if (!cues) {
      status = 'no-track'
      console.log('[bb-subsgen] no subtitle track for this video')
      return
    }
    status = 'active'

    stopMount = mount(({ shadowRoot, video, container }) => {
      const stopHover = attachHover({
        shadowRoot,
        video,
        lookupDefs,
        isTraditional: () => settings.useTraditional,
      })
      let lastIndex = -1
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

      const render = () => {
        if (lastIndex === -1) {
          clearCue(shadowRoot)
          return
        }
        renderCue(
          shadowRoot,
          segment(cues[lastIndex].text, words),
          settings,
          cacheFor(settings.translationLang).get(lastIndex) ?? '',
        )
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

      const stopSync = watchPlayback(video, cues, (index) => {
        lastIndex = index
        render()
        renderProgress()
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
