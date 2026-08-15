import { describe, expect, test, vi } from 'vitest'
import {
  chatCompletion,
  listModels,
  LlmError,
  normalizeBaseUrl,
  originOfBaseUrl,
  permissionPatternFor,
  streamChatCompletion,
} from './client'
import type { NewLlmLogEntry } from './types'

const BASE = 'http://localhost:1234/v1'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

/** A streamed response whose chunk boundaries are exactly the ones given. */
function sseResponse(chunks: string[]): Response {
  const encoder = new TextEncoder()
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
        controller.close()
      },
    }),
    { status: 200 },
  )
}

function collector() {
  const entries: NewLlmLogEntry[] = []
  return { entries, log: (entry: NewLlmLogEntry) => entries.push(entry) }
}

describe('normalizeBaseUrl', () => {
  test.each([
    ['http://localhost:1234/v1', 'http://localhost:1234/v1'],
    ['http://localhost:1234/v1/', 'http://localhost:1234/v1'],
    ['http://localhost:1234', 'http://localhost:1234/v1'],
    ['http://localhost:1234/', 'http://localhost:1234/v1'],
    ['  http://localhost:1234  ', 'http://localhost:1234/v1'],
    // Typed without a scheme, which is how a port on localhost is usually written.
    ['localhost:11434', 'http://localhost:11434/v1'],
    ['127.0.0.1:1234', 'http://127.0.0.1:1234/v1'],
  ])('%s -> %s', (input, expected) => {
    expect(normalizeBaseUrl(input)).toBe(expected)
  })

  test('keeps a path that is already there, so a server behind a prefix still works', () => {
    expect(normalizeBaseUrl('http://box.local:8000/llm/v1')).toBe('http://box.local:8000/llm/v1')
  })

  test('an empty setting stays empty rather than becoming a bogus URL', () => {
    expect(normalizeBaseUrl('   ')).toBe('')
  })
})

describe('originOfBaseUrl', () => {
  test('is the origin, port and all', () => {
    expect(originOfBaseUrl('localhost:1234')).toBe('http://localhost:1234')
  })

  test('is null when there is nothing to show', () => {
    expect(originOfBaseUrl('')).toBeNull()
  })
})

describe('permissionPatternFor', () => {
  // Chrome match patterns have no port component: asking for
  // `http://localhost:1234/*` is rejected as malformed, not merely ignored.
  test('drops the port, because a match pattern cannot carry one', () => {
    expect(permissionPatternFor('http://localhost:1234/v1')).toBe('http://localhost/*')
    expect(permissionPatternFor('http://127.0.0.1:11434/v1')).toBe('http://127.0.0.1/*')
  })

  test('one grant therefore covers every port on the host', () => {
    expect(permissionPatternFor('localhost:1234')).toBe(
      permissionPatternFor('localhost:11434'),
    )
  })

  test('keeps https for a model server that is not local', () => {
    expect(permissionPatternFor('https://box.local/v1')).toBe('https://box.local/*')
  })

  test('refuses a scheme content cannot be fetched from', () => {
    expect(permissionPatternFor('ftp://box.local/v1')).toBeNull()
  })

  test('is null when nothing is configured', () => {
    expect(permissionPatternFor('')).toBeNull()
  })
})

describe('listModels', () => {
  test('returns the ids, sorted', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({ data: [{ id: 'qwen3-8b' }, { id: 'gemma-27b' }] }),
    )

    expect(await listModels({ baseUrl: BASE, fetchImpl })).toEqual(['gemma-27b', 'qwen3-8b'])
    expect(fetchImpl.mock.calls[0][0]).toBe('http://localhost:1234/v1/models')
  })

  test('ignores entries without a usable id', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ data: [{ id: 'real' }, {}, { id: '' }] }))

    expect(await listModels({ baseUrl: BASE, fetchImpl })).toEqual(['real'])
  })

  test('an empty server is empty, not an error', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ data: [] }))

    expect(await listModels({ baseUrl: BASE, fetchImpl })).toEqual([])
  })

  test('reports an HTTP failure with its status and body', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('nope', { status: 503 }))
    const { entries, log } = collector()

    await expect(listModels({ baseUrl: BASE, fetchImpl, log })).rejects.toMatchObject({
      name: 'LlmError',
      status: 503,
      body: 'nope',
    })
    expect(entries[0]).toMatchObject({ level: 'error', kind: 'models', status: 503, detail: 'nope' })
  })

  // The single most likely failure: the server simply is not running.
  test('turns a refused connection into a message that says what to check', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    const { entries, log } = collector()

    const failure = await listModels({ baseUrl: BASE, fetchImpl, log }).catch((e: LlmError) => e)

    expect((failure as LlmError).message).toContain('Could not reach the model server')
    expect((failure as LlmError).message).toContain('host permission')
    expect(entries[0].level).toBe('error')
  })
})

describe('chatCompletion', () => {
  test('sends the model and messages, and reads the reply back', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        choices: [{ message: { content: 'hello' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 4 },
      }),
    )

    const reply = await chatCompletion({
      baseUrl: BASE,
      model: 'qwen3-8b',
      messages: [{ role: 'user', content: '你好' }],
      fetchImpl,
    })

    expect(reply).toEqual({
      content: 'hello',
      finishReason: 'stop',
      usage: { promptTokens: 10, completionTokens: 4 },
    })

    const body = JSON.parse(fetchImpl.mock.calls[0][1].body)
    expect(body).toMatchObject({
      model: 'qwen3-8b',
      stream: false,
      messages: [{ role: 'user', content: '你好' }],
    })
  })

  test('passes temperature and response_format only when asked', async () => {
    const bodies: string[] = []
    // A fresh Response per call: a body can only be read once.
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      bodies.push(String(init?.body))
      return jsonResponse({ choices: [] })
    })

    await chatCompletion({ baseUrl: BASE, model: 'm', messages: [], fetchImpl })
    expect(JSON.parse(bodies[0])).not.toHaveProperty('temperature')

    await chatCompletion({ baseUrl: BASE, model: 'm', messages: [], temperature: 0, fetchImpl })
    expect(JSON.parse(bodies[1]).temperature).toBe(0)
  })

  test('an empty choices array is an empty reply, not a crash', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ choices: [] }))

    expect(await chatCompletion({ baseUrl: BASE, model: 'm', messages: [], fetchImpl })).toEqual({
      content: '',
      finishReason: null,
      usage: null,
    })
  })

  test('warns rather than informs when the reply was cut off at the token limit', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({ choices: [{ message: { content: 'cut' }, finish_reason: 'length' }] }),
    )
    const { entries, log } = collector()

    await chatCompletion({ baseUrl: BASE, model: 'm', messages: [], fetchImpl, log })

    expect(entries.at(-1)).toMatchObject({ level: 'warn' })
    expect(entries.at(-1)!.message).toContain('cut off')
  })

  test('keeps the server body on a failure, because it names the missing model', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response('model "ghost" not found', { status: 404 }))

    await expect(
      chatCompletion({ baseUrl: BASE, model: 'ghost', messages: [], fetchImpl }),
    ).rejects.toMatchObject({ status: 404, body: 'model "ghost" not found' })
  })
})

describe('streamChatCompletion', () => {
  const frame = (delta: string) => `data: ${JSON.stringify({ choices: [{ delta: { content: delta } }] })}\n\n`

  test('assembles the deltas and reports each one in order', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(sseResponse([frame('你'), frame('好'), 'data: [DONE]\n\n']))
    const seen: string[] = []

    const reply = await streamChatCompletion({
      baseUrl: BASE,
      model: 'm',
      messages: [],
      fetchImpl,
      onDelta: (d) => seen.push(d),
    })

    expect(seen).toEqual(['你', '好'])
    expect(reply.content).toBe('你好')
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body).stream).toBe(true)
  })

  // Chunk boundaries are set by the network, not by event boundaries.
  test('survives a frame split across two network chunks', async () => {
    const whole = frame('好')
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(sseResponse([whole.slice(0, 20), whole.slice(20)]))
    const seen: string[] = []

    await streamChatCompletion({
      baseUrl: BASE,
      model: 'm',
      messages: [],
      fetchImpl,
      onDelta: (d) => seen.push(d),
    })

    expect(seen).toEqual(['好'])
  })

  test('picks up finish_reason and the trailing usage frame', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      sseResponse([
        frame('hi'),
        `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] })}\n\n`,
        `data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 7, completion_tokens: 2 } })}\n\n`,
        'data: [DONE]\n\n',
      ]),
    )

    const reply = await streamChatCompletion({
      baseUrl: BASE,
      model: 'm',
      messages: [],
      fetchImpl,
      onDelta: () => {},
    })

    expect(reply.finishReason).toBe('stop')
    expect(reply.usage).toEqual({ promptTokens: 7, completionTokens: 2 })
  })

  test('skips an unparseable frame and keeps the rest of the reply', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(sseResponse([frame('a'), 'data: {not json\n\n', frame('b')]))
    const { entries, log } = collector()

    const reply = await streamChatCompletion({
      baseUrl: BASE,
      model: 'm',
      messages: [],
      fetchImpl,
      log,
      onDelta: () => {},
    })

    expect(reply.content).toBe('ab')
    expect(entries.some((e) => e.level === 'warn' && e.message.includes('unparseable'))).toBe(true)
  })

  test('reports tokens per second once usage is known', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      sseResponse([
        frame('hi'),
        `data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 1, completion_tokens: 40 } })}\n\n`,
      ]),
    )
    const { entries, log } = collector()
    // The whole exchange takes under a millisecond here, and a rate needs a
    // duration to divide by.
    vi.spyOn(Date, 'now').mockReturnValueOnce(0).mockReturnValue(1000)

    await streamChatCompletion({
      baseUrl: BASE,
      model: 'm',
      messages: [],
      fetchImpl,
      log,
      onDelta: () => {},
    })

    expect(entries.at(-1)!.message).toContain('40.0 tok/s')
    vi.restoreAllMocks()
  })
})
