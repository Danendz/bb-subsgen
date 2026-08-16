import { describe, expect, test } from 'vitest'
import { looksLikeTranscript } from './cue'

describe('looksLikeTranscript', () => {
  /** `count` cues spread evenly over `seconds`, which is what a real track is. */
  function spread(count: number, seconds: number) {
    const step = seconds / count
    return Array.from({ length: count }, (_, at) => ({
      start: at * step,
      end: at * step + 1,
      text: '新疆很大。',
    }))
  }

  test('rejects the single promotional cue bangumi serves for a whole episode', () => {
    // ep335910: fifty minutes of documentary, one cue of
    // `↓↓敲重点↓↓…保存头像用微信扫呀`. Structurally a perfect track.
    const advert = [{ start: 0, end: 8, text: '↓↓敲重点↓↓精彩的保存头像用微信扫呀' }]
    expect(looksLikeTranscript(advert, 3000)).toBe(false)
  })

  test('accepts a real track', () => {
    // Roughly what fifty minutes of speech actually produces.
    expect(looksLikeTranscript(spread(700, 3000), 3000)).toBe(true)
  })

  test('accepts a short clip whose whole track is one line', () => {
    // The same cue count the advert had. Only the runtime tells them apart,
    // which is the entire reason duration is threaded through to here.
    expect(looksLikeTranscript([{ start: 1, end: 4, text: '你好' }], 12)).toBe(true)
  })

  test('accepts a sparse but genuine track well clear of the floor', () => {
    // Ten times below typical speech density and still kept: being wrong in the
    // strict direction throws away the publisher's own text.
    expect(looksLikeTranscript(spread(60, 3000), 3000)).toBe(true)
  })

  test('has no opinion when the duration is unknown', () => {
    // Not knowing how long the video is, is not evidence against the track.
    expect(looksLikeTranscript([{ start: 0, end: 8, text: '广告' }], 0)).toBe(true)
    expect(looksLikeTranscript([{ start: 0, end: 8, text: '广告' }], NaN)).toBe(true)
  })

  test('is false for no cues at all, whatever the duration', () => {
    expect(looksLikeTranscript([], 3000)).toBe(false)
    expect(looksLikeTranscript([], 0)).toBe(false)
  })
})
