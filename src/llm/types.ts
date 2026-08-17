// Wire types for an OpenAI-compatible chat completions server.
//
// One shape covers LM Studio, Ollama, llama.cpp's server, vLLM and Jan: they all
// expose /v1/models and /v1/chat/completions with the same payloads, so the
// "which runner is this" question never has to be asked. Anything genuinely
// vendor-specific belongs in its own module rather than widening these.

export type LlmRole = 'system' | 'user' | 'assistant'

export interface LlmMessage {
  role: LlmRole
  content: string
}

/**
 * A JSON Schema the reply is asked to conform to.
 *
 * Servers that don't implement it ignore the field rather than rejecting the
 * request, so asking for a schema never guarantees getting one — every caller
 * still has to cope with a reply that isn't the JSON it asked for.
 */
export interface JsonSchemaFormat {
  type: 'json_schema'
  json_schema: { name: string; strict?: boolean; schema: object }
}

export interface LlmUsage {
  promptTokens: number
  completionTokens: number
}

export interface LlmReply {
  content: string
  /** Verbatim from the server — `stop`, `length`, … — and absent on some. */
  finishReason: string | null
  /** Absent on servers that don't report it, and on most streamed replies. */
  usage: LlmUsage | null
}

export interface ChatOptions {
  baseUrl: string
  model: string
  messages: LlmMessage[]
  /** Omitted means "whatever the server defaults to"; translation pins it to 0. */
  temperature?: number
  responseFormat?: JsonSchemaFormat
  signal?: AbortSignal
  /** Injectable so tests never touch the network. */
  fetchImpl?: typeof fetch
  /** Injectable so tests never touch IndexedDB. Defaults to doing nothing. */
  log?: LlmLogger
}

// ---------------------------------------------------------------------------
// Debug log
//
// Lives here rather than in log.ts so the client can be handed a logger without
// depending on the store behind it.

export type LlmLogLevel = 'debug' | 'info' | 'warn' | 'error'

/** Which part of the feature spoke. Filterable in the app's log viewer. */
export type LlmLogKind =
  | 'connect'
  | 'models'
  | 'chat'
  | 'explain'
  | 'translate-batch'
  | 'transcribe'

export interface NewLlmLogEntry {
  level: LlmLogLevel
  kind: LlmLogKind
  /** Correlates a request with its response, its retry and its eventual error. */
  requestId: string
  model?: string
  message: string
  /** Bodies and prompts. Truncated unless `llmVerboseLog` is on. */
  detail?: string
  durationMs?: number
  /** HTTP status, on failures that got as far as a response. */
  status?: number
}

export interface LlmLogEntry extends NewLlmLogEntry {
  /** autoIncrement, so ascending key order is insertion order. */
  seq: number
  at: number
}

export type LlmLogger = (entry: NewLlmLogEntry) => void

/** The default logger: logging is a side effect of asking, never the point of it. */
export const noLog: LlmLogger = () => {}

/** Unique enough to correlate rows within one session, which is all it is for. */
export function newRequestId(): string {
  return Math.random().toString(36).slice(2, 10)
}
