import { describe, expect, test } from 'vitest'
import { looksLikeTranscript, normalizeCue, pickBestSubtitleTrack, trackQuery } from './subtitles'

describe('trackQuery', () => {
  test('names an ordinary video with bvid', () => {
    const query = new URLSearchParams(
      trackQuery({ aid: 12345, cid: 678, videoId: 'BV1bVuo6AESP' }),
    )
    expect(query.get('bvid')).toBe('BV1bVuo6AESP')
    expect(query.get('ep_id')).toBeNull()
    expect(query.get('aid')).toBe('12345')
    expect(query.get('cid')).toBe('678')
  })

  test('names a bangumi episode with ep_id, and drops the prefix', () => {
    // The endpoint wants the bare number; `ep335910` is the URL's spelling and
    // sending it verbatim is how this silently returns no tracks at all.
    const query = new URLSearchParams(trackQuery({ aid: 12345, cid: 678, videoId: 'ep335910' }))
    expect(query.get('ep_id')).toBe('335910')
    expect(query.get('bvid')).toBeNull()
  })
})

describe('pickBestSubtitleTrack', () => {
  test('prefers human Chinese over AI Chinese', () => {
    const track = pickBestSubtitleTrack([
      { lan: 'ai-zh', lan_doc: '中文（AI）', subtitle_url: 'https://x/ai.json' },
      { lan: 'zh-Hans', lan_doc: '中文', subtitle_url: 'https://x/human.json' },
    ])
    expect(track?.lan).toBe('zh-Hans')
  })

  test('falls back to AI Chinese when no human track exists', () => {
    const track = pickBestSubtitleTrack([
      { lan: 'ai-zh', lan_doc: '中文（AI）', subtitle_url: 'https://x/ai.json' },
    ])
    expect(track?.lan).toBe('ai-zh')
  })

  test('ignores tracks with no subtitle_url', () => {
    const track = pickBestSubtitleTrack([
      { lan: 'zh-Hans', lan_doc: '中文', subtitle_url: '' },
    ])
    expect(track).toBeNull()
  })

  test('returns null for an empty or unrelated track list', () => {
    expect(pickBestSubtitleTrack([])).toBeNull()
    expect(
      pickBestSubtitleTrack([{ lan: 'ko', lan_doc: '한국어', subtitle_url: 'https://x/ko.json' }]),
    ).toBeNull()
  })
})

describe('normalizeCue', () => {
  test('passes through cues already in seconds', () => {
    expect(normalizeCue({ from: 1.5, to: 3.2, content: '你好' })).toEqual({
      start: 1.5,
      end: 3.2,
      text: '你好',
    })
  })

  test('converts millisecond timings to seconds', () => {
    expect(normalizeCue({ from: 150000, to: 320000, content: '你好' })).toEqual({
      start: 150,
      end: 320,
      text: '你好',
    })
  })

  test('accepts the start_time/end_time/text field variant', () => {
    expect(normalizeCue({ start_time: 1, end_time: 2, text: '你好' })).toEqual({
      start: 1,
      end: 2,
      text: '你好',
    })
  })

  test('rejects a cue where end does not exceed start', () => {
    expect(normalizeCue({ from: 5, to: 5, content: '你好' })).toBeNull()
  })

  test('rejects a cue with empty text', () => {
    expect(normalizeCue({ from: 1, to: 2, content: '' })).toBeNull()
  })
})

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
