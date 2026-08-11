import { mount } from './mount'
import { renderCue, clearCue } from './overlay'
import { watchPlayback } from './sync'
import { attachHover } from './hover'
import { parseBvidFromUrl, fetchVideoInfo, watchBvidChange } from '../bilibili/resolve'
import { fetchSubtitles, type Cue, type SubtitleTrack } from '../bilibili/subtitles'
import { segment } from '../lang/segment'
import { loadWords, initDefs } from '../lang/dict'
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

async function main() {
  const [words, lookupDefs, initialSettings] = await Promise.all([
    loadWords(),
    initDefs(),
    loadSettings(),
  ])
  let settings = initialSettings
  let stopMount: (() => void) | null = null
  let rerenderCurrentCue: (() => void) | null = null
  let status: Status = 'loading'

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!isGetStatusMessage(msg)) return
    sendResponse({ status })
  })

  const loadCurrentVideo = async () => {
    stopMount?.()
    stopMount = null
    rerenderCurrentCue = null
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
        renderCue(shadowRoot, segment(cues[lastIndex].text, words), settings)
      }
      rerenderCurrentCue = render
      const stopSync = watchPlayback(video, cues, (index) => {
        lastIndex = index
        render()
      })
      return () => {
        stopHover()
        stopSync()
      }
    })
  }

  watchBvidChange(loadCurrentVideo)
  onSettingsChanged((next) => {
    const enabledChanged = next.enabled !== settings.enabled
    settings = next
    if (enabledChanged) loadCurrentVideo()
    else rerenderCurrentCue?.()
  })

  await loadCurrentVideo()
}

main()
