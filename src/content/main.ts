import { mount } from './mount'
import { renderCue, clearCue, setTranslation } from './overlay'
import { watchPlayback } from './sync'
import { attachHover } from './hover'
import { withUserActivation } from './activation'
import { runTranslationPass } from './translations'
import { parseBvidFromUrl, fetchVideoInfo, watchBvidChange } from '../bilibili/resolve'
import { fetchSubtitles, type Cue, type SubtitleTrack } from '../bilibili/subtitles'
import { segment } from '../lang/segment'
import { loadWords, initDefs } from '../lang/dict'
import { createTranslator, isTranslatorSupported, translatorAvailability } from '../lang/translate'
import { loadSettings, onSettingsChanged } from '../shared/settings'
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

interface TranslateTrackDeps {
  texts: string[]
  currentIndex: () => number
  onResult: (index: number, translated: string) => void
  signal: AbortSignal
}

/**
 * Acquires a translator and runs the whole track through it in the background.
 *
 * Silently does nothing where the API doesn't exist (non-Chrome, Chrome < 138,
 * mobile) — an absent English line is the correct fallback, never a broken one.
 */
async function translateTrack({
  texts,
  currentIndex,
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
  console.log('[bb-subsgen] translator availability:', await translatorAvailability())

  let translator
  try {
    // Needs a user gesture on the page; resolves on the first click or keypress.
    // The first ever run also downloads the zh→en language pack.
    translator = await withUserActivation(
      () =>
        createTranslator((fraction) =>
          console.log(`[bb-subsgen] language pack ${Math.round(fraction * 100)}%`),
        ),
      { signal },
    )
  } catch (e) {
    if (!signal.aborted) console.warn('[bb-subsgen] could not create translator', e)
    return
  }
  if (signal.aborted) return

  console.log('[bb-subsgen] translating', texts.length, 'cues')
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
  // Keyed by cue index, which is also what v2 word alignment will attach to.
  const translations = new Map<number, string>()
  let status: Status = 'loading'

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

    stopMount = mount(({ shadowRoot, video }) => {
      const stopHover = attachHover({
        shadowRoot,
        video,
        lookupDefs,
        isTraditional: () => settings.useTraditional,
      })
      let lastIndex = -1
      const render = () => {
        if (lastIndex === -1) {
          clearCue(shadowRoot)
          return
        }
        renderCue(
          shadowRoot,
          segment(cues[lastIndex].text, words),
          settings,
          translations.get(lastIndex) ?? '',
        )
      }
      rerenderCurrentCue = render
      const stopSync = watchPlayback(video, cues, (index) => {
        lastIndex = index
        render()
      })

      startTranslation = () => {
        if (!settings.showTranslation || translationAbort) return
        const controller = new AbortController()
        translationAbort = controller
        void translateTrack({
          // Blanking already-translated cues makes the pass skip them, so
          // toggling the setting off and back on doesn't redo finished work.
          texts: cues.map((cue, index) => (translations.has(index) ? '' : cue.text)),
          currentIndex: () => lastIndex,
          onResult: (index, translated) => {
            translations.set(index, translated)
            if (index === lastIndex) setTranslation(shadowRoot, translated)
          },
          signal: controller.signal,
        })
      }
      startTranslation()

      return () => {
        stopHover()
        stopSync()
      }
    })
  }

  watchBvidChange(loadCurrentVideo)
  onSettingsChanged((next) => {
    const enabledChanged = next.enabled !== settings.enabled
    const translationToggled = next.showTranslation !== settings.showTranslation
    settings = next
    if (enabledChanged) {
      loadCurrentVideo()
      return
    }
    if (translationToggled) {
      if (next.showTranslation) startTranslation?.()
      else stopTranslation()
    }
    rerenderCurrentCue?.()
  })

  await loadCurrentVideo()
}

main()
