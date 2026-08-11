import { describe, expect, test } from 'vitest'
import { normalizeCue, pickBestSubtitleTrack } from './subtitles'

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
