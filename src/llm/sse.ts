// Server-sent events, only as much of them as an OpenAI-compatible stream uses.
//
// The chunk parser is split out as a pure string -> events function because the
// bugs here are all in the buffering, and testing buffering through a real
// ReadableStream means constructing one just to assert something that has
// nothing to do with streams. A JSON payload arriving split across two network
// chunks is the normal case, not the edge case.

/** The `data:` payloads in a chunk. No server here uses `event:`, `id:` or `retry:`. */
export interface SseParse {
  data: string[]
  /** The incomplete tail, to be prepended to the next chunk. */
  rest: string
}

/** The sentinel payload that ends an OpenAI-compatible stream. */
export const SSE_DONE = '[DONE]'

export function parseSseChunk(buffer: string): SseParse {
  // A trailing CR may be the first half of a CRLF still in flight. Holding it
  // back stops it being read as a line ending of its own, which would split an
  // event in two and lose the half that had the `data:` prefix.
  const holdingCr = buffer.endsWith('\r')
  const body = holdingCr ? buffer.slice(0, -1) : buffer

  // The spec allows \r\n, \n and a bare \r. Splitting on the wrong one silently
  // swallows every event, so normalize before looking for the blank line.
  const blocks = body.replace(/\r\n?/g, '\n').split('\n\n')
  // The last block has no terminator yet, so by definition it is incomplete.
  const rest = blocks.pop() ?? ''

  const data: string[] = []
  for (const block of blocks) {
    const lines = block.split('\n').filter((line) => line.startsWith('data:'))
    // Comment lines (`: keep-alive`) and empty blocks carry no payload.
    if (lines.length === 0) continue
    // Multiple data lines in one event are joined with newlines, per the spec.
    data.push(lines.map((line) => line.slice(5).replace(/^ /, '')).join('\n'))
  }

  return { data, rest: holdingCr ? `${rest}\r` : rest }
}

/**
 * Decodes a response body into `data:` payloads, calling back per event.
 *
 * `[DONE]` is passed through rather than swallowed — the caller decides whether
 * an early end is a clean finish or a truncation.
 */
export async function readSseStream(
  body: ReadableStream<Uint8Array>,
  onData: (payload: string) => void,
): Promise<void> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      // `stream: true` keeps a multi-byte character split across two chunks
      // from being decoded as two replacement characters — which is a live
      // concern here, where most of the payload is Chinese.
      buffer += decoder.decode(value, { stream: true })

      const { data, rest } = parseSseChunk(buffer)
      buffer = rest
      for (const payload of data) onData(payload)
    }
  } finally {
    reader.releaseLock()
  }
}
