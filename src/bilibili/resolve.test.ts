import { describe, expect, test } from 'vitest'
import { parseBvidFromUrl, resolveCid, resolvePageNumber } from './resolve'

describe('parseBvidFromUrl', () => {
  test('extracts the bvid from a video URL', () => {
    expect(parseBvidFromUrl('https://www.bilibili.com/video/BV1bVuo6AESP')).toBe(
      'BV1bVuo6AESP',
    )
  })

  test('extracts the bvid when query params follow', () => {
    expect(
      parseBvidFromUrl('https://www.bilibili.com/video/BV1bVuo6AESP?p=3&vd_source=abc'),
    ).toBe('BV1bVuo6AESP')
  })

  test('returns null for non-video pages', () => {
    expect(parseBvidFromUrl('https://www.bilibili.com/bangumi/play/ep123456')).toBeNull()
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
