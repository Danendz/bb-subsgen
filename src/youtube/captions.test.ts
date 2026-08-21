import { describe, expect, test } from 'vitest'
import {
  borrowPoToken,
  captionUrl,
  fetchChineseCaptions,
  parseJson3,
  pickChineseTrack,
} from './captions'
import type { CaptionTrack } from './player-response'

const track = (over: Partial<CaptionTrack> = {}): CaptionTrack => ({
  baseUrl: 'https://www.youtube.com/api/timedtext?v=PC3DmhI-3tU&lang=en',
  languageCode: 'en',
  name: 'English',
  ...over,
})

describe('pickChineseTrack', () => {
  test('prefers a human Chinese track over an auto-generated one', () => {
    const best = pickChineseTrack([
      track({ languageCode: 'zh-Hans', kind: 'asr' }),
      track({ languageCode: 'zh-Hans' }),
    ])
    expect(best?.kind).toBeUndefined()
  })

  test('prefers simplified over traditional', () => {
    // The dictionary and segmenter are built around simplified; `useTraditional`
    // converts for display, so starting here loses nothing.
    expect(
      pickChineseTrack([track({ languageCode: 'zh-Hant' }), track({ languageCode: 'zh-Hans' })])
        ?.languageCode,
    ).toBe('zh-Hans')
  })

  test('takes traditional when that is all there is', () => {
    for (const code of ['zh-Hant', 'zh-TW', 'zh-HK']) {
      expect(pickChineseTrack([track({ languageCode: code })])?.languageCode).toBe(code)
    }
  })

  test('takes an auto-generated Chinese track over a human English one', () => {
    const best = pickChineseTrack([
      track({ languageCode: 'en' }),
      track({ languageCode: 'zh-Hans', kind: 'asr' }),
    ])
    expect(best?.languageCode).toBe('zh-Hans')
  })

  test('is null when nothing is Chinese', () => {
    // The real drama upload: one hand-made English track and nothing else.
    expect(pickChineseTrack([track({ languageCode: 'en' })])).toBeNull()
    expect(pickChineseTrack([])).toBeNull()
  })
})

describe('parseJson3', () => {
  test('reads timings and text', () => {
    expect(
      parseJson3({
        events: [{ tStartMs: 2820, dDurationMs: 2520, segs: [{ utf8: '你好' }, { utf8: '世界' }] }],
      }),
    ).toEqual([{ start: 2.82, end: 5.34, text: '你好世界' }])
  })

  test('drops the rolling duplicates an auto-generated track emits', () => {
    // An `asr` track re-sends the line so far with every new word. Keeping these
    // shows each sentence several times over, growing.
    const cues = parseJson3({
      events: [
        { tStartMs: 0, dDurationMs: 1000, segs: [{ utf8: '我' }] },
        { tStartMs: 500, dDurationMs: 1000, segs: [{ utf8: '我们' }], aAppend: 1 },
        { tStartMs: 1000, dDurationMs: 1000, segs: [{ utf8: '我们走吧' }] },
      ],
    })
    expect(cues.map((c) => c.text)).toEqual(['我', '我们走吧'])
  })

  test('drops events that carry no text', () => {
    // Window-positioning events have no `segs` at all; a segment can also be
    // whitespace, which would render as a blank subtitle.
    expect(
      parseJson3({
        events: [
          { tStartMs: 0, dDurationMs: 1000 },
          { tStartMs: 0, dDurationMs: 1000, segs: [{ utf8: '\n' }] },
          { tStartMs: 0, dDurationMs: 1000, segs: [{ utf8: '真的' }] },
        ],
      }),
    ).toEqual([{ start: 0, end: 1, text: '真的' }])
  })

  test('sorts by start, and rejects a zero-length cue', () => {
    const cues = parseJson3({
      events: [
        { tStartMs: 5000, dDurationMs: 1000, segs: [{ utf8: 'b' }] },
        { tStartMs: 1000, dDurationMs: 0, segs: [{ utf8: 'zero' }] },
        { tStartMs: 0, dDurationMs: 1000, segs: [{ utf8: 'a' }] },
      ],
    })
    expect(cues.map((c) => c.text)).toEqual(['a', 'b'])
  })

  test('is empty for anything that is not a json3 file', () => {
    expect(parseJson3({})).toEqual([])
    expect(parseJson3(null)).toEqual([])
    expect(parseJson3({ events: 'nope' })).toEqual([])
  })
})

describe('borrowPoToken', () => {
  const withPot = (pot: string) =>
    `https://www.youtube.com/api/timedtext?v=x&lang=en&potc=1&pot=${pot}&fmt=json3`

  test('takes the token off the player’s own subtitle request', () => {
    expect(borrowPoToken([{ name: withPot('AAAA') }])).toEqual({ pot: 'AAAA', potc: '1' })
  })

  test('takes the most recent one when the player has asked more than once', () => {
    expect(borrowPoToken([{ name: withPot('OLD') }, { name: withPot('NEW') }])?.pot).toBe('NEW')
  })

  test('ignores requests that carry no token', () => {
    // The extension's own failed attempt is in this list too, and reusing its
    // tokenless URL would be a loop of empty responses.
    expect(
      borrowPoToken([{ name: 'https://www.youtube.com/api/timedtext?v=x&lang=en&fmt=json3' }]),
    ).toBeNull()
  })

  test('is null when the player has not fetched subtitles at all', () => {
    // The ordinary case, not a failure: captions are off until switched on.
    expect(borrowPoToken([])).toBeNull()
    expect(borrowPoToken([{ name: 'https://www.youtube.com/watch?v=x' }])).toBeNull()
    expect(borrowPoToken([{ name: 'not a url at all' }])).toBeNull()
  })
})

describe('captionUrl', () => {
  test('asks for json3 and carries the borrowed token', () => {
    const url = new URL(captionUrl(track({ languageCode: 'zh-Hans' }), { pot: 'T', potc: '1' }))
    expect(url.searchParams.get('fmt')).toBe('json3')
    expect(url.searchParams.get('pot')).toBe('T')
    expect(url.searchParams.get('potc')).toBe('1')
  })

  test('never asks for a machine translation', () => {
    // `tlang` would fabricate Chinese from an English track: text matching
    // neither the audio nor anything the publisher wrote, turned into flashcards.
    const url = new URL(captionUrl(track({ languageCode: 'zh-Hans' }), { pot: 'T', potc: '1' }))
    expect(url.searchParams.get('tlang')).toBeNull()
  })
})

describe('fetchChineseCaptions', () => {
  const token = [{ name: 'https://www.youtube.com/api/timedtext?v=x&potc=1&pot=TOKEN' }]

  test('returns cues when everything lines up', async () => {
    const fetchImpl = (async () =>
      new Response(
        JSON.stringify({ events: [{ tStartMs: 0, dDurationMs: 1000, segs: [{ utf8: '你好' }] }] }),
      )) as unknown as typeof fetch

    expect(
      await fetchChineseCaptions({
        tracks: [track({ languageCode: 'zh-Hans' })],
        entries: token,
        fetchImpl,
      }),
    ).toEqual([{ start: 0, end: 1, text: '你好' }])
  })

  test('is empty when there is no Chinese track, without asking the network', async () => {
    let called = 0
    const fetchImpl = (async () => {
      called++
      return new Response('{}')
    }) as unknown as typeof fetch

    expect(await fetchChineseCaptions({ tracks: [track()], entries: token, fetchImpl })).toEqual([])
    expect(called).toBe(0)
  })

  test('is empty when no token can be borrowed', async () => {
    let called = 0
    const fetchImpl = (async () => {
      called++
      return new Response('{}')
    }) as unknown as typeof fetch

    expect(
      await fetchChineseCaptions({
        tracks: [track({ languageCode: 'zh-Hans' })],
        entries: [],
        fetchImpl,
      }),
    ).toEqual([])
    expect(called).toBe(0)
  })

  test('is empty for the 200-with-nothing-in-it that YouTube actually returns', async () => {
    // Verified live: without a valid token the endpoint answers 200 and an empty
    // body. Treating that as success would blank the subtitles for the video.
    const fetchImpl = (async () => new Response('')) as unknown as typeof fetch
    expect(
      await fetchChineseCaptions({
        tracks: [track({ languageCode: 'zh-Hans' })],
        entries: token,
        fetchImpl,
      }),
    ).toEqual([])
  })

  test('is empty rather than throwing when the request fails', async () => {
    const fetchImpl = (async () => {
      throw new TypeError('Failed to fetch')
    }) as unknown as typeof fetch
    expect(
      await fetchChineseCaptions({
        tracks: [track({ languageCode: 'zh-Hans' })],
        entries: token,
        fetchImpl,
      }),
    ).toEqual([])
  })
})
