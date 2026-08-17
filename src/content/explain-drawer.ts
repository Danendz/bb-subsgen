// The explanation drawer, on the video.
//
// An iframe of the extension's own flashcards page rather than a chat UI built
// again in here. That is not a shortcut — it is the only version of this that
// can stream. A content script runs on Bilibili's origin, so its fetches are
// subject to CORS and Chrome's private-network rules block it from reaching
// localhost at all; every token would have to be relayed through the service
// worker over a port. The iframe runs on the extension origin, which means it
// talks to the model server directly and reuses the same panel the Chat tab and
// the review drawer use.
//
// The cost is that the frame and the page can only exchange messages, which is
// why closing is a postMessage rather than a function call.

/** Sent by the framed page when it wants to be dismissed. */
export const CLOSE_EXPLAIN = 'bb-subsgen:close-explain'

export interface ExplainParams {
  /** The line as it is on screen — what the passage is rebuilt from. */
  line: string
  word?: string
  videoId?: string
  start?: number
  title?: string
}

/**
 * The framed page's URL.
 *
 * Parameters go in the search rather than after the hash so the app's hash
 * router still sees a plain route, and `URLSearchParams` can read them without
 * anything having to parse a hash by hand.
 */
export function explainUrl(params: ExplainParams, base: string): string {
  const search = new URLSearchParams({ embed: '1', line: params.line })
  if (params.word) search.set('word', params.word)
  if (params.videoId) search.set('videoId', params.videoId)
  if (params.start !== undefined) search.set('start', String(params.start))
  if (params.title) search.set('title', params.title)

  return `${base}?${search.toString()}#/explain`
}

const SCRIM_STYLE =
  'position:absolute; inset:0; z-index:1000; display:flex; justify-content:flex-end;' +
  'background:rgb(0 0 0 / 0.5); pointer-events:auto;'

const FRAME_STYLE =
  'width:min(420px,100%); height:100%; border:0; background:#17131d;' +
  'box-shadow:-20px 0 60px rgb(0 0 0 / 0.45);'

/**
 * Opens the drawer over the player, resolving once it has been closed.
 *
 * The promise is the contract that lets the hover machinery keep the video
 * paused for exactly as long as the drawer is up — see `attachHover`.
 */
export function openExplainDrawer(root: ShadowRoot, params: ExplainParams): Promise<void> {
  return new Promise((resolve) => {
    const scrim = document.createElement('div')
    scrim.style.cssText = SCRIM_STYLE

    const frame = document.createElement('iframe')
    frame.style.cssText = FRAME_STYLE
    frame.src = explainUrl(params, chrome.runtime.getURL('src/app/index.html'))
    scrim.appendChild(frame)

    let closed = false
    const close = () => {
      if (closed) return
      closed = true
      removeEventListener('message', onMessage)
      removeEventListener('keydown', onKey, true)
      scrim.remove()
      resolve()
    }

    const onMessage = (e: MessageEvent) => {
      // The frame is the extension's own page, so anything else claiming to be
      // it is the host page talking, and is ignored.
      if (e.source !== frame.contentWindow) return
      if ((e.data as { type?: string } | null)?.type === CLOSE_EXPLAIN) close()
    }

    // Escape typed on the page rather than in the frame; the frame sends its own.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      close()
    }

    scrim.addEventListener('click', (e) => {
      if (e.target === scrim) close()
    })

    addEventListener('message', onMessage)
    addEventListener('keydown', onKey, true)
    root.appendChild(scrim)
  })
}
