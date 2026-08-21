import type { PlayerChrome } from './chrome'

const HOST_ID = 'bb-subsgen-host'

export interface MountHandle {
  shadowRoot: ShadowRoot
  video: HTMLVideoElement
  /** The player box the overlay is positioned against — also what carries
   *  `data-ctrl-hidden`, which drives the control-bar lift. */
  container: HTMLElement
  teardown: () => void
}

type OnMount = (handle: Omit<MountHandle, 'teardown'>) => (() => void) | void

function hideNativeSubtitles(container: HTMLElement, selector: string) {
  container
    .querySelectorAll<HTMLElement>(selector)
    .forEach((el) => el.style.setProperty('display', 'none', 'important'))
}

function restoreNativeSubtitles(container: HTMLElement, selector: string) {
  container
    .querySelectorAll<HTMLElement>(selector)
    .forEach((el) => el.style.removeProperty('display'))
}

function createShadowHost(container: HTMLElement): ShadowRoot {
  const existing = container.querySelector<HTMLElement>(`#${HOST_ID}`)
  existing?.remove()

  const host = document.createElement('div')
  host.id = HOST_ID
  host.style.cssText = 'position:absolute; inset:0; pointer-events:none; z-index:999;'
  container.appendChild(host)
  return host.attachShadow({ mode: 'open' })
}

/**
 * Waits for the player container to exist (both supported sites are SPAs, so it
 * isn't present at document_start), mounts a shadow-root overlay inside it so it
 * survives native fullscreen, hides the native CC track, and re-mounts
 * automatically if the player subtree is replaced.
 *
 * Which container, and which native subtitles, comes from `chrome` — the one
 * thing about this that is not the same on every site.
 */
export function mount(chrome: PlayerChrome, onMount: OnMount): () => void {
  let current: MountHandle | null = null

  const tryMount = () => {
    const container = document.querySelector<HTMLElement>(chrome.containerSelector)
    const video = container?.querySelector('video')
    if (!container || !video) return

    if (current && document.contains(current.video)) return // already mounted on the live player

    current?.teardown()
    hideNativeSubtitles(container, chrome.nativeSubtitleSelector)
    const shadowRoot = createShadowHost(container)
    const extraCleanup = onMount({ shadowRoot, video, container })
    const teardown = () => {
      extraCleanup?.()
      restoreNativeSubtitles(container, chrome.nativeSubtitleSelector)
      shadowRoot.host.remove()
    }
    current = { shadowRoot, video, container, teardown }
  }

  tryMount()
  const observer = new MutationObserver(tryMount)
  observer.observe(document.body, { childList: true, subtree: true })

  return () => {
    observer.disconnect()
    current?.teardown()
    current = null
  }
}
