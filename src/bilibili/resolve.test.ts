// @vitest-environment jsdom
import { describe, expect, test } from 'vitest'
import {
  episodesOf,
  isEpisodeId,
  parseVideoIdFromUrl,
  resolveCid,
  resolveDuration,
  resolvePageNumber,
  watchVideoChange,
} from './resolve'

describe('parseVideoIdFromUrl', () => {
  test('extracts the videoId from a video URL', () => {
    expect(parseVideoIdFromUrl('https://www.bilibili.com/video/BV1bVuo6AESP')).toBe(
      'BV1bVuo6AESP',
    )
  })

  test('extracts the videoId when query params follow', () => {
    expect(
      parseVideoIdFromUrl('https://www.bilibili.com/video/BV1bVuo6AESP?p=3&vd_source=abc'),
    ).toBe('BV1bVuo6AESP')
  })

  test('extracts the episode id from a bangumi URL', () => {
    expect(parseVideoIdFromUrl('https://www.bilibili.com/bangumi/play/ep335910')).toBe('ep335910')
  })

  test('extracts a season id, which is not the same identity as an episode', () => {
    // Worth having its own case: a season URL names a series, not a video, and
    // the canonical id is the `ep` it resolves to. This is enough for change
    // detection and deliberately not enough to file a capture under.
    expect(parseVideoIdFromUrl('https://www.bilibili.com/bangumi/play/ss12345')).toBe('ss12345')
  })

  test('returns null for pages that are not a video at all', () => {
    expect(parseVideoIdFromUrl('https://www.bilibili.com/')).toBeNull()
    expect(parseVideoIdFromUrl('https://www.bilibili.com/anime/')).toBeNull()
  })
})

describe('episodesOf', () => {
  test('returns the numbered episodes', () => {
    const episodes = episodesOf({
      episodes: [
        { id: 335910, aid: 1, cid: 11 },
        { id: 335911, aid: 2, cid: 22 },
      ],
    })
    expect(episodes.map((episode) => episode.id)).toEqual([335910, 335911])
  })

  test('includes the extras, which are watchable pages like any other', () => {
    // The survey that motivated all this counted seven entries in a six-episode
    // season: the seventh was a promo, and it was the only one with a subtitle
    // track. Worth resolving, and worth not mistaking for an episode.
    const episodes = episodesOf({
      episodes: [{ id: 335910, aid: 1, cid: 11 }],
      section: [{ episodes: [{ id: 999999, aid: 3, cid: 33 }] }],
    })
    expect(episodes.map((episode) => episode.id)).toEqual([335910, 999999])
  })

  test('copes with a season that has neither', () => {
    expect(episodesOf({})).toEqual([])
    expect(episodesOf({ section: [{}] })).toEqual([])
  })
})

describe('isEpisodeId', () => {
  test('tells a bangumi episode from an ordinary video', () => {
    expect(isEpisodeId('ep335910')).toBe(true)
    expect(isEpisodeId('ss12345')).toBe(true)
    expect(isEpisodeId('BV1bVuo6AESP')).toBe(false)
  })
})

describe('resolvePageNumber', () => {
  test('defaults to 1 when ?p= is absent', () => {
    expect(resolvePageNumber('https://www.bilibili.com/video/BV1bVuo6AESP')).toBe(1)
  })

  test('reads ?p= for multi-part videos', () => {
    expect(resolvePageNumber('https://www.bilibili.com/video/BV1bVuo6AESP?p=3')).toBe(3)
  })
})

describe('resolveCid', () => {
  test('prefers __INITIAL_STATE__ cid as the SPA-accurate truth', () => {
    const cid = resolveCid({
      initialStateCid: 111,
      pages: [{ cid: 222 }],
      pageParam: 1,
      fallbackCid: 333,
    })
    expect(cid).toBe(111)
  })

  test('falls back to the page-indexed cid when __INITIAL_STATE__ is unavailable', () => {
    const cid = resolveCid({
      initialStateCid: undefined,
      pages: [{ cid: 111 }, { cid: 222 }, { cid: 333 }],
      pageParam: 2,
      fallbackCid: 999,
    })
    expect(cid).toBe(222)
  })

  test('falls back to the base cid when neither state nor pages are available', () => {
    const cid = resolveCid({
      initialStateCid: undefined,
      pages: undefined,
      pageParam: 1,
      fallbackCid: 999,
    })
    expect(cid).toBe(999)
  })
})

describe('watchVideoChange', () => {
  const go = (url: string) => history.pushState({}, '', url)

  test('reports the new video on SPA navigation between videos', () => {
    history.replaceState({}, '', '/video/BV1aaaaaaaaa')
    const seen: Array<string | null> = []
    const stop = watchVideoChange((videoId) => seen.push(videoId))

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
    const stop = watchVideoChange((videoId) => seen.push(videoId))

    go('/')
    stop()

    expect(seen).toEqual([null])
  })

  test('does not report a URL change that stays on the same video', () => {
    history.replaceState({}, '', '/video/BV1aaaaaaaaa')
    const seen: Array<string | null> = []
    const stop = watchVideoChange((videoId) => seen.push(videoId))

    go('/video/BV1aaaaaaaaa?t=90')
    stop()

    expect(seen).toEqual([])
  })

  test('does not report twice for a page that never had a video', () => {
    history.replaceState({}, '', '/')
    const seen: Array<string | null> = []
    const stop = watchVideoChange((videoId) => seen.push(videoId))

    go('/search')
    stop()

    expect(seen).toEqual([])
  })

  test('stops listening once torn down', () => {
    history.replaceState({}, '', '/video/BV1aaaaaaaaa')
    const seen: Array<string | null> = []
    watchVideoChange((videoId) => seen.push(videoId))()

    go('/video/BV1ccccccccc')

    expect(seen).toEqual([])
  })
})

describe('resolveDuration', () => {
  const pages = [
    { cid: 111, duration: 300 },
    { cid: 222, duration: 900 },
  ]

  test('takes the runtime of the part on screen, not the collection’s', () => {
    // 1200 is every part added together. Using it would make part two look four
    // times longer than it is, and a complete track look like an advert.
    expect(resolveDuration(222, pages, 1200)).toBe(900)
  })

  test('falls back to the whole-video figure when there are no parts', () => {
    expect(resolveDuration(111, undefined, 314)).toBe(314)
    expect(resolveDuration(111, [], 314)).toBe(314)
  })

  test('falls back when the cid names no page it knows', () => {
    expect(resolveDuration(999, pages, 1200)).toBe(1200)
  })

  test('answers 0 rather than NaN when the API said nothing', () => {
    // 0 is what `looksLikeTranscript` reads as "unknown"; NaN would work by
    // accident there and break any arithmetic that came later.
    expect(resolveDuration(111, [], undefined)).toBe(0)
    expect(resolveDuration(111, [], null)).toBe(0)
    expect(resolveDuration(111, [], 'nonsense')).toBe(0)
  })
})
