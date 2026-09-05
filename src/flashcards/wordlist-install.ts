// Downloads a curated word list and writes it to the deck, from the Data tab.
//
// The shape of `src/dict/install.ts` — injected `fetch` per
// .claude/rules/testing.md, a byte-counting stream for the progress bar — with
// two of its decisions deliberately not carried over:
//
//   - no `DecompressionStream`. These are ~3MB of plain JSON, not a 63MB gzip.
//   - no incremental parser. `JSON.parse` needs the whole string anyway, so
//     the seam that makes the dictionary import streamable buys nothing here.
//
// Runs on the app page, not the worker, for the reason `src/dict/install.ts`
// gives: an MV3 worker is idle-terminated, and a half-written list is a deck
// ranked against two different files at once.

import { replaceWordList, type WordListMeta } from '../background/flashcards-store'
import { readerFor } from './wordlist-readers'
import { SOURCE_REFS, type WordListSource } from './wordlist-sources'

export interface WordListProgress {
  /** Bytes read so far. */
  loaded: number
  /** `Content-Length`, or null when the server did not send one. */
  total: number | null
}

export interface WordListInstallOptions {
  source: WordListSource
  fetch: typeof fetch
  onProgress?: (progress: WordListProgress) => void
  signal?: AbortSignal
}

export async function installWordList({
  source,
  fetch: doFetch,
  onProgress,
  signal,
}: WordListInstallOptions): Promise<WordListMeta> {
  const read = readerFor(source.id)
  if (!read) throw new Error(`no reader for ${source.id}`)

  const response = await doFetch(source.url, { signal })
  if (!response.ok || !response.body) {
    throw new Error(`could not download ${source.name}: HTTP ${response.status}`)
  }
  const contentLength = Number(response.headers.get('content-length'))
  const total = Number.isFinite(contentLength) && contentLength > 0 ? contentLength : null

  let loaded = 0
  const counted = response.body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        loaded += chunk.byteLength
        onProgress?.({ loaded, total })
        controller.enqueue(chunk)
      },
    }),
  )
  const textStream: ReadableStream<string> = counted.pipeThrough(
    // The same DOM-lib cast `src/dict/install.ts` documents: TS types the
    // Uint8Array over ArrayBuffer here and ArrayBufferLike in the stream's own
    // declaration. Both are the same Uint8Array at runtime.
    new TextDecoderStream() as unknown as ReadableWritablePair<string, Uint8Array>,
  )

  // Read to a string rather than pumped into a parser: the payload is JSON, so
  // there is nothing useful to do with a chunk until the last one has arrived.
  const chunks: string[] = []
  const reader = textStream.getReader()
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }

  const rows = read(chunks.join(''), source.kind)
  if (rows.length === 0) throw new Error(`${source.name} yielded no words`)

  const meta: WordListMeta = {
    name: source.label,
    count: rows.length,
    uploadedAt: Date.now(),
    sourceId: source.id,
    ref: SOURCE_REFS[source.id],
  }
  // `replaceWordList` already clears this kind's stale field across the
  // language while keeping the other kind's, in one transaction. Do not
  // reimplement that here.
  await replaceWordList(source.lang, source.kind, rows, meta)
  return meta
}
