import { describe, expect, test } from 'vitest'
import { extractJson, fetchPlayerResponse, readPlayerResponse } from './player-response'

/**
 * The shape of the real thing, with the fields this extension reads.
 *
 * Values taken from a live capture of `PC3DmhI-3tU`, including the two that
 * matter most: `videoDetails` carries **no** language field of any kind, and the
 * only caption track is a human English one on a Chinese drama.
 */
const RESPONSE = {
  videoDetails: {
    videoId: 'PC3DmhI-3tU',
    title: '#杨紫 租”狂野男孩“假扮男友《家有儿女》第一季第1集【中国电视剧精选】',
    shortDescription: '家有儿女 第一季',
    author: '中国电视剧精选 Chinese Drama',
    channelId: 'UC2Ce9ttakhococ7GhOzyONA',
    lengthSeconds: '1513',
    isLiveContent: false,
  },
  captions: {
    playerCaptionsTracklistRenderer: {
      captionTracks: [
        {
          baseUrl: 'https://www.youtube.com/api/timedtext?v=PC3DmhI-3tU&lang=en',
          name: { simpleText: 'English' },
          vssId: '.en',
          languageCode: 'en',
          isTranslatable: true,
        },
      ],
      translationLanguages: Array.from({ length: 156 }, (_, i) => ({ languageCode: `l${i}` })),
    },
  },
}

const pageHtml = (payload: unknown) =>
  `<!DOCTYPE html><html><head><script nonce="x">var meta = {"a":1};` +
  `var ytInitialPlayerResponse = ${JSON.stringify(payload)};var after = 2;</script></head></html>`

describe('extractJson', () => {
  test('takes the balanced object after the marker', () => {
    expect(extractJson(pageHtml({ a: { b: 1 } }), 'ytInitialPlayerResponse')).toEqual({
      a: { b: 1 },
    })
  })

  test('survives a brace inside a string, which a lazy regex would not', () => {
    // A description reading `};` is enough to truncate a `/\{.+?\};/` match.
    const payload = { videoDetails: { shortDescription: 'closes like this: };  really' } }
    expect(extractJson(pageHtml(payload), 'ytInitialPlayerResponse')).toEqual(payload)
  })

  test('survives an escaped quote inside a string', () => {
    const payload = { videoDetails: { title: 'a \\" quote and { a brace' } }
    expect(extractJson(pageHtml(payload), 'ytInitialPlayerResponse')).toEqual(payload)
  })

  test('does not run on to the end of the page', () => {
    // A greedy match would swallow `var after = 2` and everything after it.
    expect(extractJson(pageHtml({ a: 1 }), 'ytInitialPlayerResponse')).toEqual({ a: 1 })
  })

  test('is null when the marker is absent or the payload is unparseable', () => {
    expect(extractJson('<html></html>', 'ytInitialPlayerResponse')).toBeNull()
    expect(extractJson('ytInitialPlayerResponse = {oops', 'ytInitialPlayerResponse')).toBeNull()
  })
})

describe('readPlayerResponse', () => {
  test('reads the fields the adapter needs', () => {
    const read = readPlayerResponse(RESPONSE)
    expect(read).toMatchObject({
      videoId: 'PC3DmhI-3tU',
      author: '中国电视剧精选 Chinese Drama',
      channelId: 'UC2Ce9ttakhococ7GhOzyONA',
      lengthSeconds: 1513,
      isLive: false,
    })
    expect(read?.captionTracks).toEqual([
      expect.objectContaining({ languageCode: 'en', name: 'English' }),
    ])
  })

  test('leaves `kind` absent on a human track and set on an auto one', () => {
    // The whole language verdict turns on this field, in both directions.
    expect(readPlayerResponse(RESPONSE)?.captionTracks[0].kind).toBeUndefined()

    const auto = readPlayerResponse({
      ...RESPONSE,
      captions: {
        playerCaptionsTracklistRenderer: {
          captionTracks: [
            { baseUrl: 'https://x/y', languageCode: 'zh-Hans', kind: 'asr', name: {} },
          ],
        },
      },
    })
    expect(auto?.captionTracks[0].kind).toBe('asr')
  })

  test('reads a name given as runs rather than simpleText', () => {
    const read = readPlayerResponse({
      ...RESPONSE,
      captions: {
        playerCaptionsTracklistRenderer: {
          captionTracks: [
            { baseUrl: 'https://x/y', languageCode: 'en', name: { runs: [{ text: 'English' }] } },
          ],
        },
      },
    })
    expect(read?.captionTracks[0].name).toBe('English')
  })

  test('is empty rather than broken when a video has no captions at all', () => {
    expect(readPlayerResponse({ videoDetails: RESPONSE.videoDetails })?.captionTracks).toEqual([])
  })

  test('is null without videoDetails, which is what an error page looks like', () => {
    expect(readPlayerResponse({})).toBeNull()
    expect(readPlayerResponse(null)).toBeNull()
  })

  test('reports a live stream as live', () => {
    const live = readPlayerResponse({
      videoDetails: { ...RESPONSE.videoDetails, isLive: true, isLiveContent: true },
    })
    expect(live?.isLive).toBe(true)
  })
})

describe('fetchPlayerResponse', () => {
  test('asks for the canonical watch URL, not whatever the tab is showing', async () => {
    // One cache key per video, and nothing read here depends on the playlist or
    // timestamp a real visit carries.
    const seen: string[] = []
    const fetchImpl = (async (url: string) => {
      seen.push(url)
      return new Response(pageHtml(RESPONSE))
    }) as unknown as typeof fetch

    const read = await fetchPlayerResponse('PC3DmhI-3tU', fetchImpl)
    expect(seen).toEqual(['https://www.youtube.com/watch?v=PC3DmhI-3tU'])
    expect(read?.videoId).toBe('PC3DmhI-3tU')
  })

  test('is null rather than throwing when the page will not load', async () => {
    const failing = (async () => {
      throw new TypeError('Failed to fetch')
    }) as unknown as typeof fetch
    expect(await fetchPlayerResponse('PC3DmhI-3tU', failing)).toBeNull()

    const notFound = (async () => new Response('', { status: 404 })) as unknown as typeof fetch
    expect(await fetchPlayerResponse('PC3DmhI-3tU', notFound)).toBeNull()
  })

  test('is null when the page carries no player response', async () => {
    const bare = (async () => new Response('<html></html>')) as unknown as typeof fetch
    expect(await fetchPlayerResponse('PC3DmhI-3tU', bare)).toBeNull()
  })
})
