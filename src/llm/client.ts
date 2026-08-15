// The OpenAI-compatible client.
//
// `fetch` is injectable throughout so the tests never touch the network, and
// the logger is injectable so they never touch IndexedDB. Nothing in here knows
// which runner is on the other end — see types.ts for why that is enough.
//
// This module runs on the extension origin only (the service worker, the study
// app, the drawer iframe). A content script cannot call it: content-script
// fetches carry the page's origin, so they are subject to CORS, and Chrome's
// private-network rules block a public page from reaching localhost at all.

import { readSseStream, SSE_DONE } from './sse'
import { newRequestId, noLog, type ChatOptions, type LlmReply, type LlmUsage } from './types'

/** Ready-made base URLs for the two runners most people have installed. */
export const LLM_PRESETS: ReadonlyArray<{ label: string; baseUrl: string }> = [
  { label: 'LM Studio', baseUrl: 'http://localhost:1234/v1' },
  { label: 'Ollama', baseUrl: 'http://localhost:11434/v1' },
]

/**
 * How long to wait on the model list.
 *
 * Short, because this is a reachability probe rather than real work: if the
 * server is not there, the answer arrives as a connection refusal in
 * milliseconds, and the only thing a long timeout buys is a longer wait before
 * telling you so.
 */
const PROBE_TIMEOUT_MS = 5000

export class LlmError extends Error {
  readonly status?: number
  readonly body?: string

  constructor(message: string, opts: { status?: number; body?: string; cause?: unknown } = {}) {
    super(message, { cause: opts.cause })
    this.name = 'LlmError'
    this.status = opts.status
    this.body = opts.body
  }
}

/**
 * Accepts the ways people actually type a base URL and produces the one shape
 * the endpoints are appended to.
 *
 * `localhost:1234`, `http://localhost:1234`, and a trailing slash all mean the
 * same thing and all end up at `http://localhost:1234/v1`. A URL that already
 * carries a path keeps it, so a server behind a prefix is still reachable.
 */
export function normalizeBaseUrl(input: string): string {
  const trimmed = input.trim().replace(/\/+$/, '')
  if (!trimmed) return ''

  // A local server typed without a scheme is http, never https. Any scheme at
  // all counts as present — testing only for http(s) would turn `ftp://host`
  // into `http://ftp://host`, whose hostname parses as `ftp`.
  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
  const withScheme = hasScheme ? trimmed : `http://${trimmed}`

  try {
    const url = new URL(withScheme)
    const path = url.pathname.replace(/\/+$/, '')
    return path ? `${url.origin}${path}` : `${url.origin}/v1`
  } catch {
    return trimmed
  }
}

/** The origin of a base URL, for display. Null when there is nothing parseable. */
export function originOfBaseUrl(baseUrl: string): string | null {
  const normalized = normalizeBaseUrl(baseUrl)
  if (!normalized) return null
  try {
    return new URL(normalized).origin
  } catch {
    return null
  }
}

/**
 * The match pattern to request host permission with.
 *
 * Deliberately not the origin: Chrome match patterns have no port component, and
 * `http://localhost:1234/*` is rejected as malformed rather than merely ignored.
 * `http://localhost/*` is the correct spelling and covers every port on the
 * host — which is also what you want, since changing the port in the settings
 * should not require a second permission prompt.
 */
export function permissionPatternFor(baseUrl: string): string | null {
  const normalized = normalizeBaseUrl(baseUrl)
  if (!normalized) return null
  try {
    const { protocol, hostname } = new URL(normalized)
    if (protocol !== 'http:' && protocol !== 'https:') return null
    return `${protocol}//${hostname}/*`
  } catch {
    return null
  }
}

async function failureBody(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 4000)
  } catch {
    return ''
  }
}

/**
 * Turns anything thrown by `fetch` into an LlmError that says something useful.
 *
 * A refused connection surfaces as a bare `TypeError: Failed to fetch`, which is
 * the single most common thing that will go wrong here and the least helpful
 * message it could carry.
 */
function connectionError(baseUrl: string, cause: unknown): LlmError {
  if (cause instanceof DOMException && cause.name === 'AbortError') {
    return new LlmError('Request cancelled', { cause })
  }
  return new LlmError(
    `Could not reach the model server at ${baseUrl}. Is it running, and is the host permission granted?`,
    { cause },
  )
}

export interface ListModelsOptions {
  baseUrl: string
  signal?: AbortSignal
  fetchImpl?: typeof fetch
  log?: ChatOptions['log']
}

/** The ids the server will accept as `model`, sorted. */
export async function listModels({
  baseUrl,
  signal,
  fetchImpl = fetch,
  log = noLog,
}: ListModelsOptions): Promise<string[]> {
  const base = normalizeBaseUrl(baseUrl)
  const requestId = newRequestId()
  const started = Date.now()
  const timeout = AbortSignal.timeout(PROBE_TIMEOUT_MS)

  let res: Response
  try {
    res = await fetchImpl(`${base}/models`, {
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    })
  } catch (e) {
    const error = connectionError(base, e)
    log({ level: 'error', kind: 'models', requestId, message: error.message, detail: String(e) })
    throw error
  }

  if (!res.ok) {
    const body = await failureBody(res)
    log({
      level: 'error',
      kind: 'models',
      requestId,
      status: res.status,
      message: `Model list failed: ${res.status} ${res.statusText}`,
      detail: body,
    })
    throw new LlmError(`Model list failed: ${res.status} ${res.statusText}`, {
      status: res.status,
      body,
    })
  }

  const payload = (await res.json()) as { data?: Array<{ id?: unknown }> }
  const models = (payload.data ?? [])
    .map((entry) => entry.id)
    .filter((id): id is string => typeof id === 'string' && id.length > 0)
    .sort()

  log({
    level: 'info',
    kind: 'models',
    requestId,
    durationMs: Date.now() - started,
    message: `${models.length} model${models.length === 1 ? '' : 's'} available at ${base}`,
    detail: models.join('\n'),
  })
  return models
}

function usageOf(raw: unknown): LlmUsage | null {
  const usage = raw as { prompt_tokens?: number; completion_tokens?: number } | undefined
  if (!usage || typeof usage.completion_tokens !== 'number') return null
  return {
    promptTokens: usage.prompt_tokens ?? 0,
    completionTokens: usage.completion_tokens,
  }
}

function requestBody(opts: ChatOptions, stream: boolean): string {
  return JSON.stringify({
    model: opts.model,
    messages: opts.messages,
    stream,
    // Asked for rather than assumed: it is what makes the log able to report
    // tokens/sec, and servers that don't know the field ignore it.
    ...(stream ? { stream_options: { include_usage: true } } : {}),
    ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
    ...(opts.responseFormat ? { response_format: opts.responseFormat } : {}),
  })
}

async function post(opts: ChatOptions, stream: boolean, requestId: string): Promise<Response> {
  const base = normalizeBaseUrl(opts.baseUrl)
  const fetchImpl = opts.fetchImpl ?? fetch
  const log = opts.log ?? noLog
  const body = requestBody(opts, stream)

  log({
    level: 'debug',
    kind: 'chat',
    requestId,
    model: opts.model,
    message: `${stream ? 'Streaming' : 'Sending'} ${opts.messages.length} message${opts.messages.length === 1 ? '' : 's'} to ${base}`,
    detail: body,
  })

  let res: Response
  try {
    res = await fetchImpl(`${base}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      signal: opts.signal,
    })
  } catch (e) {
    const error = connectionError(base, e)
    log({
      level: 'error',
      kind: 'chat',
      requestId,
      model: opts.model,
      message: error.message,
      detail: String(e),
    })
    throw error
  }

  if (!res.ok) {
    const failure = await failureBody(res)
    log({
      level: 'error',
      kind: 'chat',
      requestId,
      model: opts.model,
      status: res.status,
      message: `Completion failed: ${res.status} ${res.statusText}`,
      // A wrong or unloaded model name is the usual cause, and the server says
      // so in the body — which is the whole reason it is kept.
      detail: failure,
    })
    throw new LlmError(`Completion failed: ${res.status} ${res.statusText}`, {
      status: res.status,
      body: failure,
    })
  }

  return res
}

function logReply(opts: ChatOptions, requestId: string, reply: LlmReply, ms: number): void {
  const log = opts.log ?? noLog
  const rate =
    reply.usage && ms > 0 ? ` at ${((reply.usage.completionTokens / ms) * 1000).toFixed(1)} tok/s` : ''
  const truncated = reply.finishReason === 'length'

  log({
    level: truncated ? 'warn' : 'info',
    kind: 'chat',
    requestId,
    model: opts.model,
    durationMs: ms,
    message: truncated
      ? `Reply hit the token limit and was cut off${rate}`
      : `Replied with ${reply.content.length} characters${rate}`,
    detail: reply.content,
  })
}

/** One whole reply, waited for. Used by the batch translator, which has nothing to show mid-flight. */
export async function chatCompletion(opts: ChatOptions): Promise<LlmReply> {
  const requestId = newRequestId()
  const started = Date.now()
  const res = await post(opts, false, requestId)

  const payload = (await res.json()) as {
    choices?: Array<{ message?: { content?: string }; finish_reason?: string | null }>
    usage?: unknown
  }
  const choice = payload.choices?.[0]
  const reply: LlmReply = {
    content: choice?.message?.content ?? '',
    finishReason: choice?.finish_reason ?? null,
    usage: usageOf(payload.usage),
  }

  logReply(opts, requestId, reply, Date.now() - started)
  return reply
}

export interface StreamOptions extends ChatOptions {
  /** Called with each content fragment as it arrives, in order. */
  onDelta: (delta: string) => void
}

/**
 * A streamed reply, reported fragment by fragment.
 *
 * Used by chat and explain, where a 27B model's fifteen seconds of silence is
 * the difference between "thinking" and "broken".
 */
export async function streamChatCompletion(opts: StreamOptions): Promise<LlmReply> {
  const requestId = newRequestId()
  const started = Date.now()
  const log = opts.log ?? noLog
  const res = await post(opts, true, requestId)

  if (!res.body) throw new LlmError('The server replied without a body to stream')

  let content = ''
  let finishReason: string | null = null
  let usage: LlmUsage | null = null

  await readSseStream(res.body, (payload) => {
    if (payload === SSE_DONE) return

    let chunk: {
      choices?: Array<{ delta?: { content?: string }; finish_reason?: string | null }>
      usage?: unknown
    }
    try {
      chunk = JSON.parse(payload)
    } catch (e) {
      // One malformed frame must not lose the reply built so far.
      log({
        level: 'warn',
        kind: 'chat',
        requestId,
        model: opts.model,
        message: 'Skipped an unparseable stream frame',
        detail: `${payload}\n${String(e)}`,
      })
      return
    }

    // The usage frame carries no choices, which is why this is not an else.
    if (chunk.usage) usage = usageOf(chunk.usage) ?? usage

    const choice = chunk.choices?.[0]
    if (!choice) return
    if (choice.finish_reason) finishReason = choice.finish_reason

    const delta = choice.delta?.content
    if (delta) {
      content += delta
      opts.onDelta(delta)
    }
  })

  const reply: LlmReply = { content, finishReason, usage }
  logReply(opts, requestId, reply, Date.now() - started)
  return reply
}
