import { describe, expect, test } from 'vitest'
import { bareId, helperAudioUrl, isYoutubeId, normalizeHelperUrl, parseVideoId } from './site'

describe('parseVideoId', () => {
  test('reads a watch URL and namespaces the id', () => {
    expect(parseVideoId('https://www.youtube.com/watch?v=PC3DmhI-3tU')).toBe('yt:PC3DmhI-3tU')
  })

  test('ignores the playlist, index and timestamp a real link carries', () => {
    expect(
      parseVideoId(
        'https://www.youtube.com/watch?v=PC3DmhI-3tU&list=PLO1KXMn-Zv0ImMjoFJq&index=2&t=1s',
      ),
    ).toBe('yt:PC3DmhI-3tU')
  })

  test('namespaces so an id can never be read as a bangumi episode', () => {
    // `ep1234ABCDE` is a legal YouTube id, and `isEpisodeId` would take the bare
    // form for a Bilibili episode — filing a capture under the wrong video.
    expect(parseVideoId('https://www.youtube.com/watch?v=ep1234ABCDE')).toBe('yt:ep1234ABCDE')
    expect(isYoutubeId('yt:ep1234ABCDE')).toBe(true)
    expect(bareId('yt:ep1234ABCDE')).toBe('ep1234ABCDE')
  })

  test('is null off the watch page', () => {
    expect(parseVideoId('https://www.youtube.com/')).toBeNull()
    expect(parseVideoId('https://www.youtube.com/shorts/PC3DmhI-3tU')).toBeNull()
    expect(parseVideoId('https://www.youtube.com/@someChannel')).toBeNull()
    expect(parseVideoId('https://www.youtube.com/results?search_query=x')).toBeNull()
  })

  test('is null for a v= that is not a video id', () => {
    expect(parseVideoId('https://www.youtube.com/watch?v=')).toBeNull()
    expect(parseVideoId('https://www.youtube.com/watch?v=tooshort')).toBeNull()
    expect(parseVideoId('https://www.youtube.com/watch?v=has spaces!')).toBeNull()
  })

  test('is null rather than throwing for something that is not a URL', () => {
    expect(parseVideoId('not a url')).toBeNull()
  })
})

describe('normalizeHelperUrl', () => {
  test('assumes http for a bare host and port', () => {
    expect(normalizeHelperUrl('localhost:8770')).toBe('http://localhost:8770')
  })

  test('does NOT append /v1, unlike the OpenAI-server normaliser beside it', () => {
    // The bug this exists for: the helper serves `/audio` and `/health` and
    // nothing under `/v1`, so borrowing `normalizeBaseUrl` made every request
    // 404 — including the Connect button's health check.
    expect(normalizeHelperUrl('localhost:8770')).not.toContain('/v1')
  })

  test('strips a /v1 that the shared normaliser already added', () => {
    // An address saved before this existed has one, and should start working
    // again without being retyped.
    expect(normalizeHelperUrl('http://localhost:8770/v1')).toBe('http://localhost:8770')
    expect(normalizeHelperUrl('http://localhost:8770/v1/')).toBe('http://localhost:8770')
  })

  test('keeps a genuine path, for a helper behind a proxy', () => {
    expect(normalizeHelperUrl('http://example.test/bb/helper')).toBe(
      'http://example.test/bb/helper',
    )
  })

  test('leaves an explicit scheme alone and trims trailing slashes', () => {
    expect(normalizeHelperUrl('https://helper.test/')).toBe('https://helper.test')
    expect(normalizeHelperUrl('  localhost:8770//  ')).toBe('http://localhost:8770')
  })

  test('is empty for empty input', () => {
    expect(normalizeHelperUrl('')).toBe('')
    expect(normalizeHelperUrl('   ')).toBe('')
  })
})

describe('helperAudioUrl', () => {
  test('asks the helper for the bare id, not the namespaced one', () => {
    // The helper talks to YouTube, which has never heard of our prefix.
    expect(helperAudioUrl('http://127.0.0.1:8770', 'yt:PC3DmhI-3tU')).toBe(
      'http://127.0.0.1:8770/audio?v=PC3DmhI-3tU',
    )
  })

  test('tolerates a trailing slash on the configured base URL', () => {
    expect(helperAudioUrl('http://127.0.0.1:8770/', 'yt:PC3DmhI-3tU')).toBe(
      'http://127.0.0.1:8770/audio?v=PC3DmhI-3tU',
    )
  })

  test('corrects a stored /v1 at the point of use', () => {
    // So an address saved by the old code path works without being retyped.
    expect(helperAudioUrl('http://127.0.0.1:8770/v1', 'yt:PC3DmhI-3tU')).toBe(
      'http://127.0.0.1:8770/audio?v=PC3DmhI-3tU',
    )
  })
})
