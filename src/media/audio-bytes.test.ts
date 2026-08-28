import { describe, expect, test, vi } from 'vitest'
import { fetchAudioBytes } from './audio-bytes'

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
