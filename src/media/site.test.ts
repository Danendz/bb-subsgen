// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { URL_POLL_MS, watchVideoChange } from './site'
import { parseVideoIdFromUrl } from '../bilibili/resolve'

// Driven with Bilibili's parser because the watcher's contract is about noticing
// a change, not about what an id looks like — and a real parser is a better
// witness to that than a stub that returns whatever it is handed.

describe('watchVideoChange', () => {
  /**
   * Bilibili navigating, which is not the same as the content script navigating.
   *
   * Bound native, and bound before the watcher exists, because the page runs in
   * its own JS world: nothing the content script puts on its `history` is on the
   * path of a navigation the page makes. jsdom has a single world and will
   * happily let a test call whatever the watcher installed — which is exactly
   * how a watcher that could never fire in a browser passed this suite.
   */
  const navigate = history.pushState.bind(history)

  const go = (url: string) => {
    navigate({}, '', url)
    vi.advanceTimersByTime(URL_POLL_MS)
  }

  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test('reports the new video on SPA navigation between videos', () => {
    history.replaceState({}, '', '/video/BV1aaaaaaaaa')
    const seen: Array<string | null> = []
    const stop = watchVideoChange(parseVideoIdFromUrl, (videoId) => seen.push(videoId))

    go('/video/BV1bbbbbbbbb')
    stop()

    expect(seen).toEqual(['BV1bbbbbbbbb'])
  })

  /**
   * Leaving a video is a change too, and the one that matters most: the
   * translation pass is cancelled from this callback, so a departure that does
   * not fire leaves the model translating a video nobody is watching.
   */
  test('reports leaving a video for a page that has none', () => {
    history.replaceState({}, '', '/video/BV1aaaaaaaaa')
    const seen: Array<string | null> = []
    const stop = watchVideoChange(parseVideoIdFromUrl, (videoId) => seen.push(videoId))

    go('/')
    stop()

    expect(seen).toEqual([null])
  })

  test('does not report a URL change that stays on the same video', () => {
    history.replaceState({}, '', '/video/BV1aaaaaaaaa')
    const seen: Array<string | null> = []
    const stop = watchVideoChange(parseVideoIdFromUrl, (videoId) => seen.push(videoId))

    go('/video/BV1aaaaaaaaa?t=90')
    stop()

    expect(seen).toEqual([])
  })

  test('does not report twice for a page that never had a video', () => {
    history.replaceState({}, '', '/')
    const seen: Array<string | null> = []
    const stop = watchVideoChange(parseVideoIdFromUrl, (videoId) => seen.push(videoId))

    go('/search')
    stop()

    expect(seen).toEqual([])
  })

  test('reports a back navigation without waiting for the next poll', () => {
    history.replaceState({}, '', '/video/BV1aaaaaaaaa')
    const seen: Array<string | null> = []
    const stop = watchVideoChange(parseVideoIdFromUrl, (videoId) => seen.push(videoId))

    navigate({}, '', '/video/BV1bbbbbbbbb')
    window.dispatchEvent(new PopStateEvent('popstate'))
    stop()

    expect(seen).toEqual(['BV1bbbbbbbbb'])
  })

  test('stops listening once torn down', () => {
    history.replaceState({}, '', '/video/BV1aaaaaaaaa')
    const seen: Array<string | null> = []
    watchVideoChange(parseVideoIdFromUrl, (videoId) => seen.push(videoId))()

    go('/video/BV1ccccccccc')

    expect(seen).toEqual([])
  })
})
