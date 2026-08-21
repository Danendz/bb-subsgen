import { describe, expect, test, vi } from 'vitest'
import {
  fetchAudioBytes,
  fetchAudioTrack,
  pickAudioStream,
  playurlUrl,
  readPlayurl,
  resolveAudioSource,
} from './audio'

describe('playurlUrl', () => {
  test('asks the pgc endpoint for a bangumi episode', () => {
    const url = new URL(playurlUrl('ep335910', 678))
    expect(url.pathname).toBe('/pgc/player/web/playurl')
    expect(url.searchParams.get('ep_id')).toBe('335910')
    expect(url.searchParams.get('cid')).toBe('678')
    expect(url.searchParams.get('bvid')).toBeNull()
  })

  test('asks the ordinary endpoint for a video', () => {
    const url = new URL(playurlUrl('BV1bVuo6AESP', 678))
    expect(url.pathname).toBe('/x/player/playurl')
    expect(url.searchParams.get('bvid')).toBe('BV1bVuo6AESP')
    expect(url.searchParams.get('ep_id')).toBeNull()
  })

  test('always asks for DASH, which is what splits the audio out', () => {
    // Without fnval the API answers with the legacy muxed format and there is
    // no separate audio stream to fetch at all.
    expect(new URL(playurlUrl('ep335910', 1)).searchParams.get('fnval')).toBe('4048')
    expect(new URL(playurlUrl('BV1bVuo6AESP', 1)).searchParams.get('fnval')).toBe('4048')
  })
})

describe('pickAudioStream', () => {
  test('takes the cheapest rendition, because it all becomes 16kHz mono anyway', () => {
    const stream = pickAudioStream([
      { baseUrl: 'https://cdn/hi', bandwidth: 148_000, codecs: 'mp4a.40.2' },
      { baseUrl: 'https://cdn/lo', bandwidth: 66_000, codecs: 'mp4a.40.2' },
      { baseUrl: 'https://cdn/mid', bandwidth: 86_000, codecs: 'mp4a.40.2' },
    ])
    expect(stream?.url).toBe('https://cdn/lo')
    expect(stream?.bandwidth).toBe(66_000)
  })

  test('accepts the snake_case spelling some responses use', () => {
    expect(pickAudioStream([{ base_url: 'https://cdn/a', bandwidth: 1 }])?.url).toBe(
      'https://cdn/a',
    )
  })

  test('ignores renditions with no URL on them', () => {
    const stream = pickAudioStream([
      { bandwidth: 1 },
      { baseUrl: '', bandwidth: 2 },
      { baseUrl: 'https://cdn/real', bandwidth: 99 },
    ])
    expect(stream?.url).toBe('https://cdn/real')
  })

  test('returns null when there is nothing to pick', () => {
    expect(pickAudioStream([])).toBeNull()
    expect(pickAudioStream(undefined)).toBeNull()
    expect(pickAudioStream('nonsense')).toBeNull()
  })
})

describe('readPlayurl', () => {
  const dash = { audio: [{ baseUrl: 'https://cdn/lo', bandwidth: 66_000, codecs: 'mp4a.40.2' }] }

  test('reads the bangumi shape, which answers under result', () => {
    const track = readPlayurl({ code: 0, result: { dash, timelength: 3_000_000 } })
    expect(track?.stream.url).toBe('https://cdn/lo')
    expect(track?.duration).toBe(3000)
  })

  test('reads the ordinary-video shape, which answers under data', () => {
    const track = readPlayurl({ code: 0, data: { dash, timelength: 600_000 } })
    expect(track?.stream.url).toBe('https://cdn/lo')
    expect(track?.duration).toBe(600)
  })

  test('returns null when the API refused', () => {
    expect(readPlayurl({ code: -404, result: { dash } })).toBeNull()
  })

  test('returns null for a video served without DASH', () => {
    // The legacy muxed format: playable, but with no audio stream to pull out.
    expect(readPlayurl({ code: 0, result: { timelength: 600_000 } })).toBeNull()
  })
})

describe('fetchAudioTrack', () => {
  test('resolves the stream and duration', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            code: 0,
            result: {
              dash: { audio: [{ baseUrl: 'https://cdn/lo', bandwidth: 66_000 }] },
              timelength: 3_000_000,
            },
          }),
        ),
    ) as unknown as typeof fetch

    const track = await fetchAudioTrack({ videoId: 'ep335910', cid: 678, fetchImpl })
    expect(track?.stream.url).toBe('https://cdn/lo')
    expect(track?.duration).toBe(3000)
  })

  test('returns null rather than throwing when the network is gone', async () => {
    // Every failure here means the same thing to the caller: leave the page
    // alone. Distinguishing them would give it nothing to do differently.
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    }) as unknown as typeof fetch

    expect(await fetchAudioTrack({ videoId: 'ep335910', cid: 678, fetchImpl })).toBeNull()
  })
})

describe('fetchAudioBytes', () => {
  test('hands back the bytes the CDN served', async () => {
    const fetchImpl = vi.fn(async () => new Response('audio')) as unknown as typeof fetch

    const result = await fetchAudioBytes('https://cdn/lo', { fetchImpl })
    expect('bytes' in result && new TextDecoder().decode(result.bytes)).toBe('audio')
  })

  /**
   * The failure this whole arrangement exists to avoid, so it is worth naming.
   * Bilibili's CDN answers 403 to a request without a bilibili referrer, which
   * is every request an extension page can make.
   */
  test('reports the status when the CDN refuses', async () => {
    const fetchImpl = vi.fn(
      async () => new Response('', { status: 403 }),
    ) as unknown as typeof fetch

    expect(await fetchAudioBytes('https://cdn/lo', { fetchImpl })).toEqual({
      error: 'Could not fetch the audio: 403',
    })
  })

  test('refuses a URL that is not https rather than fetching it', async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch

    const result = await fetchAudioBytes('http://cdn/lo', { fetchImpl })
    expect(result).toEqual({ error: 'The audio is not served over https.' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  test('reports a network failure rather than throwing at the caller', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    }) as unknown as typeof fetch

    expect(await fetchAudioBytes('https://cdn/lo', { fetchImpl })).toEqual({
      error: 'Could not fetch the audio: Failed to fetch',
    })
  })
})

describe('resolveAudioSource', () => {
  const playurl = (over: Record<string, unknown> = {}) =>
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            code: 0,
            result: {
              dash: {
                audio: [
                  { baseUrl: 'https://cdn/hi', bandwidth: 148_000 },
                  { baseUrl: 'https://cdn/lo', bandwidth: 66_000 },
                ],
              },
              timelength: 3_000_000,
              ...over,
            },
          }),
        ),
    ) as unknown as typeof fetch

  test('names the cheapest stream, its runtime, and who may fetch it', async () => {
    expect(
      await resolveAudioSource({ videoId: 'ep335910', cid: 678, fetchImpl: playurl() }),
    ).toEqual({
      url: 'https://cdn/lo',
      durationSeconds: 3000,
      via: 'page',
    })
  })

  test('always answers `page`, because the CDN checks the referrer', async () => {
    // Not a preference and not a fallback: an extension page cannot send a
    // bilibili referrer at all, so these bytes have exactly one route in.
    const source = await resolveAudioSource({
      videoId: 'BV1bVuo6AESP',
      cid: 1,
      fetchImpl: playurl(),
    })
    expect(source?.via).toBe('page')
  })

  test('is null when there is no stream to name', async () => {
    // A legacy muxed video, a region lock, an episode that will not play — the
    // caller does the same thing for all of them, so they answer alike.
    const fetchImpl = playurl({ dash: { audio: [] } })
    expect(await resolveAudioSource({ videoId: 'ep335910', cid: 678, fetchImpl })).toBeNull()
  })
})
