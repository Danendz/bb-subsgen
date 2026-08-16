import { describe, expect, test, vi } from 'vitest'
import {
  ASR_BACKOFF_MS,
  isRetryable,
  parseTimestamp,
  parseTranscription,
  shiftBy,
  transcribe,
  transcribeWithRetry,
} from './asr'
import { connectionError, LlmError } from './client'

describe('parseTranscription', () => {
  test('reads segments out of verbose_json', () => {
    const cues = parseTranscription(
      JSON.stringify({
        text: '新疆很大。天山在这里。',
        segments: [
          { id: 0, start: 1.2, end: 3.4, text: '新疆很大。' },
          { id: 1, start: 3.4, end: 6.0, text: '天山在这里。' },
        ],
      }),
    )
    expect(cues).toEqual([
      { start: 1.2, end: 3.4, text: '新疆很大。' },
      { start: 3.4, end: 6.0, text: '天山在这里。' },
    ])
  })

  test('returns null for a reply that carries only the text', () => {
    // The plain `json` format: the whole transcription, every timing discarded.
    // Unusable against a video, and distinct from a chunk that was silent.
    expect(parseTranscription(JSON.stringify({ text: '新疆很大。' }))).toBeNull()
  })

  test('returns an empty list for a silent chunk, not null', () => {
    // The difference decides whether the caller retries in another format or
    // accepts the answer. Silence is an answer.
    expect(parseTranscription(JSON.stringify({ text: '', segments: [] }))).toEqual([])
  })

  test('returns null for a body that is not JSON and has no timings', () => {
    expect(parseTranscription('Internal Server Error')).toBeNull()
    expect(parseTranscription('')).toBeNull()
  })

  test('reads SRT', () => {
    const cues = parseTranscription(
      ['1', '00:00:01,200 --> 00:00:03,400', '新疆很大。', '', '2', '00:00:03,400 --> 00:00:06,000', '天山在这里。', ''].join('\n'),
    )
    expect(cues).toEqual([
      { start: 1.2, end: 3.4, text: '新疆很大。' },
      { start: 3.4, end: 6.0, text: '天山在这里。' },
    ])
  })

  test('reads WebVTT, which differs only in the separator and a header', () => {
    const cues = parseTranscription(
      ['WEBVTT', '', '00:00:01.200 --> 00:00:03.400', '新疆很大。', ''].join('\n'),
    )
    expect(cues).toEqual([{ start: 1.2, end: 3.4, text: '新疆很大。' }])
  })

  test('joins a cue wrapped over several lines without a separator', () => {
    // Right for Chinese specifically: a space inserted at the wrap would be
    // segmented as a word boundary that is not there.
    const cues = parseTranscription(
      ['1', '00:00:01,000 --> 00:00:04,000', '新疆很大，', '天山在这里。', ''].join('\n'),
    )
    expect(cues?.[0].text).toBe('新疆很大，天山在这里。')
  })

  test('drops blank segments, which Whisper emits over silence', () => {
    const cues = parseTranscription(
      JSON.stringify({
        segments: [
          { start: 0, end: 2, text: '   ' },
          { start: 2, end: 4, text: '新疆很大。' },
        ],
      }),
    )
    expect(cues).toEqual([{ start: 2, end: 4, text: '新疆很大。' }])
  })

  test('drops a cue whose end does not follow its start', () => {
    const cues = parseTranscription(
      JSON.stringify({
        segments: [
          { start: 5, end: 5, text: '零长度' },
          { start: 9, end: 4, text: '倒过来' },
          { start: 2, end: 4, text: '新疆很大。' },
        ],
      }),
    )
    expect(cues).toEqual([{ start: 2, end: 4, text: '新疆很大。' }])
  })
})

describe('parseTimestamp', () => {
  test('reads the shapes SRT and VTT use between them', () => {
    expect(parseTimestamp('00:00:01,200')).toBeCloseTo(1.2)
    expect(parseTimestamp('00:00:01.200')).toBeCloseTo(1.2)
    expect(parseTimestamp('01:02:03.500')).toBeCloseTo(3723.5)
    expect(parseTimestamp('02:03.500')).toBeCloseTo(123.5)
  })
})

describe('shiftBy', () => {
  test('moves a chunk back to where it belongs in the track', () => {
    expect(shiftBy([{ start: 1, end: 2, text: '新疆' }], 300)).toEqual([
      { start: 301, end: 302, text: '新疆' },
    ])
  })

  test('returns the cues untouched when there is nothing to shift', () => {
    const cues = [{ start: 1, end: 2, text: '新疆' }]
    expect(shiftBy(cues, 0)).toBe(cues)
  })
})

/** A fetch that answers each call with the next body in the list. */
function fetchReturning(...bodies: string[]): typeof fetch {
  let at = 0
  return vi.fn(async () => new Response(bodies[at++] ?? '', { status: 200 })) as unknown as typeof fetch
}

const options = {
  baseUrl: 'http://localhost:8080/v1',
  model: 'ggml-large-v3-turbo',
  audio: new Blob(['x'], { type: 'audio/wav' }),
}

describe('transcribe', () => {
  test('uses verbose_json when the server understands it', async () => {
    const fetchImpl = fetchReturning(
      JSON.stringify({ segments: [{ start: 1, end: 2, text: '新疆很大。' }] }),
    )
    const cues = await transcribe({ ...options, fetchImpl })

    expect(cues).toEqual([{ start: 1, end: 2, text: '新疆很大。' }])
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  test('falls back to srt when the reply has no timings in it', async () => {
    // The case this exists for: a 200 with a perfectly good body that cannot be
    // shown against a video, which no HTTP-level check would catch.
    const fetchImpl = fetchReturning(
      JSON.stringify({ text: '新疆很大。' }),
      ['1', '00:00:01,000 --> 00:00:02,000', '新疆很大。', ''].join('\n'),
    )
    const cues = await transcribe({ ...options, fetchImpl })

    expect(cues).toEqual([{ start: 1, end: 2, text: '新疆很大。' }])
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  test('accepts a silent chunk without asking again in another format', async () => {
    const fetchImpl = fetchReturning(JSON.stringify({ segments: [] }))
    expect(await transcribe({ ...options, fetchImpl })).toEqual([])
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  test('gives up rather than looping when no format yields timings', async () => {
    const fetchImpl = fetchReturning('not json', 'still not subtitles')
    expect(await transcribe({ ...options, fetchImpl })).toEqual([])
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  test('applies the chunk offset to what comes back', async () => {
    const fetchImpl = fetchReturning(
      JSON.stringify({ segments: [{ start: 1, end: 2, text: '新疆很大。' }] }),
    )
    const cues = await transcribe({ ...options, offset: 600, fetchImpl })
    expect(cues).toEqual([{ start: 601, end: 602, text: '新疆很大。' }])
  })

  test('sends the model, the language and a greedy temperature', async () => {
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify({ segments: [] }), { status: 200 }),
    ) as unknown as typeof fetch
    await transcribe({ ...options, fetchImpl })

    const [url, init] = (fetchImpl as unknown as { mock: { calls: [string, RequestInit][] } }).mock
      .calls[0]
    const form = init.body as FormData
    expect(url).toBe('http://localhost:8080/v1/audio/transcriptions')
    expect(form.get('model')).toBe('ggml-large-v3-turbo')
    expect(form.get('language')).toBe('zh')
    expect(form.get('temperature')).toBe('0')
    expect(form.get('response_format')).toBe('verbose_json')
  })

  test('reports a failed request as an LlmError carrying the body', async () => {
    const fetchImpl = vi.fn(
      async () => new Response('model not loaded', { status: 500, statusText: 'Server Error' }),
    ) as unknown as typeof fetch

    await expect(transcribe({ ...options, fetchImpl })).rejects.toThrow(/Transcription failed: 500/)
  })

  test('falls back to whisper.cpp’s own path when the OpenAI one is a 404', async () => {
    // whisper-server answers `/v1/audio/transcriptions` with `File Not Found`
    // and serves `/inference` off the root. It is what tools/asr-server.sh
    // installs, so this is the default setup rather than an exotic one.
    const fetchImpl = vi.fn(async (url: string) =>
      url.endsWith('/inference')
        ? new Response(JSON.stringify({ segments: [{ start: 1, end: 2, text: '新疆很大。' }] }), {
            status: 200,
          })
        : new Response('File Not Found (/v1/audio/transcriptions)', {
            status: 404,
            statusText: 'Not Found',
          }),
    ) as unknown as typeof fetch

    expect(await transcribe({ ...options, fetchImpl })).toEqual([
      { start: 1, end: 2, text: '新疆很大。' },
    ])

    const calls = (fetchImpl as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls
    expect(calls.map(([url]) => url)).toEqual([
      'http://localhost:8080/v1/audio/transcriptions',
      'http://localhost:8080/inference',
    ])
  })

  test('sends the whole form to the fallback path, not a stripped one', async () => {
    const fetchImpl = vi.fn(async (url: string) =>
      url.endsWith('/inference')
        ? new Response(JSON.stringify({ segments: [] }), { status: 200 })
        : new Response('', { status: 404, statusText: 'Not Found' }),
    ) as unknown as typeof fetch
    await transcribe({ ...options, fetchImpl })

    const [, init] = (fetchImpl as unknown as { mock: { calls: [string, RequestInit][] } }).mock
      .calls[1]
    const form = init.body as FormData
    expect(form.get('model')).toBe('ggml-large-v3-turbo')
    expect(form.get('language')).toBe('zh')
    expect(form.get('response_format')).toBe('verbose_json')
  })

  test('names the real problem when no path transcribes', async () => {
    // "404 Not Found" sends you looking for a broken request. The address being
    // wrong, or the server not doing transcription at all, is the actual cause.
    const fetchImpl = vi.fn(
      async () => new Response('File Not Found', { status: 404, statusText: 'Not Found' }),
    ) as unknown as typeof fetch

    await expect(transcribe({ ...options, fetchImpl })).rejects.toThrow(
      /No transcription endpoint at http:\/\/localhost:8080\/v1/,
    )
  })

  test('does not retry elsewhere when the server refuses the work itself', async () => {
    // A 500 is the server answering about this request. Trying another path
    // would replace its explanation with a less useful one.
    const fetchImpl = vi.fn(
      async () => new Response('model not loaded', { status: 500, statusText: 'Server Error' }),
    ) as unknown as typeof fetch

    await expect(transcribe({ ...options, fetchImpl })).rejects.toThrow(/Transcription failed: 500/)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  test('says something useful when the server is not running', async () => {
    // The single most likely failure, and `TypeError: Failed to fetch` is the
    // least helpful thing it could say.
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    }) as unknown as typeof fetch

    await expect(transcribe({ ...options, fetchImpl })).rejects.toThrow(/Could not reach/)
  })
})

describe('isRetryable', () => {
  test('retries a server that could not be reached', () => {
    // The common one, and the one worth waiting for: whisper restarted, or is
    // still loading its model.
    expect(isRetryable(connectionError('http://localhost:8080/v1', new Error('refused')))).toBe(true)
  })

  test('retries the server failing rather than declining', () => {
    expect(isRetryable(new LlmError('boom', { status: 500 }))).toBe(true)
    expect(isRetryable(new LlmError('busy', { status: 429 }))).toBe(true)
    expect(isRetryable(new LlmError('slow', { status: 408 }))).toBe(true)
  })

  test('gives up at once on an address that serves no transcription', () => {
    // Otherwise one wrong URL becomes thirty doomed requests across ten chunks
    // before anything is reported.
    expect(isRetryable(new LlmError('no endpoint', { status: 404 }))).toBe(false)
  })

  test('gives up at once on a request the server refused', () => {
    // An unloaded model, or audio it will not accept. Asking again is the same
    // question.
    expect(isRetryable(new LlmError('bad request', { status: 400 }))).toBe(false)
  })

  test('does not retry something that was never the server’s answer', () => {
    // A bug here would otherwise be run three times and reported as a timeout.
    expect(isRetryable(new TypeError('cues is not iterable'))).toBe(false)
  })
})

describe('transcribeWithRetry', () => {
  const segments = (text: string) =>
    JSON.stringify({ segments: [{ start: 0, end: 2, text }] })

  /** A server that fails the first `failures` times, then answers. */
  function server(failures: number, status?: number) {
    let calls = 0
    const fetchImpl = vi.fn(async () => {
      if (calls++ < failures) {
        if (status === undefined) throw new TypeError('Failed to fetch')
        return new Response('nope', { status })
      }
      return new Response(segments('新疆很大。'), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    })
    return { fetchImpl: fetchImpl as unknown as typeof fetch, calls: () => calls }
  }

  /** Never actually waits; the backoff is seconds long by design. */
  const wait = vi.fn<(ms: number, signal?: AbortSignal) => Promise<void>>(() =>
    Promise.resolve(),
  )

  const attempt = (fetchImpl: typeof fetch) =>
    transcribeWithRetry({
      baseUrl: 'http://localhost:8080/v1',
      model: 'large-v3-turbo',
      audio: new Blob(['x']),
      fetchImpl,
      wait,
    })

  test('answers on the first attempt when the server is up', async () => {
    const { fetchImpl, calls } = server(0)

    const result = await attempt(fetchImpl)

    expect(result.cues).toEqual([{ start: 0, end: 2, text: '新疆很大。' }])
    expect(calls()).toBe(1)
  })

  test('rides out a server that comes back', async () => {
    // The common failure: whisper restarted, or is still loading its model.
    const { fetchImpl, calls } = server(2)

    const result = await attempt(fetchImpl)

    expect(result.cues).toHaveLength(1)
    expect(calls()).toBe(3)
  })

  test('gives up after the backoff runs out, and says why', async () => {
    const { fetchImpl, calls } = server(Infinity)

    const result = await attempt(fetchImpl)

    // Reported rather than thrown: one bad chunk must not cost the rest of
    // the episode.
    expect(result.cues).toBeNull()
    expect(result.error).toMatch(/Could not reach/)
    expect(calls()).toBe(ASR_BACKOFF_MS.length + 1)
  })

  test('waits between attempts rather than hammering', async () => {
    wait.mockClear()
    const { fetchImpl } = server(Infinity)

    await attempt(fetchImpl)

    expect(wait.mock.calls.map((call) => call[0])).toEqual([...ASR_BACKOFF_MS])
  })

  test('throws at once on a failure every chunk would share', async () => {
    // A wrong address answers the same way for all ten chunks. Retrying it is
    // thirty doomed requests and a minute of backoff before anything is said.
    const { fetchImpl, calls } = server(Infinity, 404)

    await expect(attempt(fetchImpl)).rejects.toThrow()
    // Both endpoints tried once each by `transcribe` itself, and no retry.
    expect(calls()).toBe(2)
  })

  test('stops quietly when the run was cancelled', async () => {
    const controller = new AbortController()
    const fetchImpl = (async () => {
      controller.abort()
      throw new DOMException('Aborted', 'AbortError')
    }) as unknown as typeof fetch

    const result = await transcribeWithRetry({
      baseUrl: 'http://localhost:8080/v1',
      model: 'large-v3-turbo',
      audio: new Blob(['x']),
      signal: controller.signal,
      fetchImpl,
      wait,
    })

    expect(result).toEqual({ cues: null })
  })
})
