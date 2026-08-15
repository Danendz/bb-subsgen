export function parseBvidFromUrl(url: string): string | null {
  const match = /\/video\/(BV[0-9A-Za-z]+)/.exec(url)
  return match?.[1] ?? null
}

export function resolvePageNumber(url: string): number {
  const param = new URL(url).searchParams.get('p')
  const page = Number(param)
  return Number.isFinite(page) && page > 0 ? page : 1
}

export interface VideoInfo {
  aid: number
  cid: number
  /**
   * Title and description, for the translator's system prompt.
   *
   * Carried out of a call already being made: knowing a video is about cooking
   * rather than history is what stops a model picking the wrong sense of a word,
   * and it is the cheapest quality fix available to the translation pass.
   */
  title: string
  description: string
}

/**
 * Resolves aid/cid via the view API rather than `__INITIAL_STATE__`, which
 * is set by an inline page script and isn't reliably present when the
 * content script runs.
 */
export async function fetchVideoInfo(bvid: string): Promise<VideoInfo | null> {
  const resp = await fetch(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`, {
    credentials: 'include',
  })
  const data = await resp.json()
  if (data.code !== 0) {
    console.warn('[bb-subsgen] view API failed:', data.message)
    return null
  }

  const cid = resolveCid({
    // On SPA navigation this is the most up-to-date cid when present.
    initialStateCid: window.__INITIAL_STATE__?.videoData?.cid,
    pages: data.data.pages,
    pageParam: resolvePageNumber(location.href),
    fallbackCid: data.data.cid,
  })

  return {
    aid: data.data.aid,
    cid,
    title: typeof data.data.title === 'string' ? data.data.title : '',
    description: typeof data.data.desc === 'string' ? data.data.desc : '',
  }
}

export interface ResolveCidOptions {
  initialStateCid: number | undefined
  pages: Array<{ cid: number }> | undefined
  pageParam: number
  fallbackCid: number
}

export function resolveCid(opts: ResolveCidOptions): number {
  return opts.initialStateCid ?? opts.pages?.[opts.pageParam - 1]?.cid ?? opts.fallbackCid
}

/**
 * Bilibili is an SPA and does not reload between videos. Calls `onChange`
 * whenever the bvid in the URL changes, so the caller can tear down and
 * rebuild the overlay for the new video.
 */
export function watchBvidChange(onChange: (bvid: string) => void): () => void {
  let currentBvid = parseBvidFromUrl(location.href)

  const check = () => {
    const bvid = parseBvidFromUrl(location.href)
    if (bvid && bvid !== currentBvid) {
      currentBvid = bvid
      onChange(bvid)
    }
  }

  const originalPushState = history.pushState
  const originalReplaceState = history.replaceState
  history.pushState = function (...args) {
    originalPushState.apply(history, args)
    check()
  }
  history.replaceState = function (...args) {
    originalReplaceState.apply(history, args)
    check()
  }
  window.addEventListener('popstate', check)

  return () => {
    history.pushState = originalPushState
    history.replaceState = originalReplaceState
    window.removeEventListener('popstate', check)
  }
}
