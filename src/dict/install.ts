// Downloads and imports a dictionary source, from the setup wizard.
//
// Runs on the wizard page rather than in the worker: the import is seconds of
// solid CPU across ~198k headwords, and an MV3 worker is idle-terminated and
// can be killed under memory pressure, which would leave a half-written store
// behind. A `chrome-extension://` page is the same origin, reaches the same
// database, and is not idle-terminated.
//
// `fetch` is an injected parameter, per src/llm/sse.ts and .claude/rules/testing.md:
// a test constructs a `ReadableStream` and never touches the network.
//
// The format is the parser's business, not this file's — see `parser.ts`. This
// is the download, the chunking and the write order, and it is the same for a
// 3.9MB gzip of lines and a 10.5MB gzip of XML.
import type { DictRow } from '../lang/pack'
import { parserFor } from './parsers'
import { clearLangIn, putDefsChunk, putLexicon, putMeta, type DictMeta } from './store'
import type { DictSource } from './sources'

// One transaction per chunk rather than one for all ~198k headwords, which is
// what the old code did and which held the whole import as a single
// transaction end to end. A few thousand headwords per transaction keeps each
// one short while still costing far fewer round trips than one per headword.
const DEFS_CHUNK_SIZE = 2000

export interface InstallProgress {
  phase: 'download' | 'import'
  /** Bytes read, during `download`; headwords written, during `import`. */
  loaded: number
  /** `Content-Length` for `download`; the total headword count for `import`. Null when unknown. */
  total: number | null
}

export interface InstallOptions {
  source: DictSource
  db: IDBDatabase
  fetch: typeof fetch
  onProgress?: (progress: InstallProgress) => void
  signal?: AbortSignal
}

export async function installDictionary({
  source,
  db,
  fetch: doFetch,
  onProgress,
  signal,
}: InstallOptions): Promise<DictMeta> {
  const parser = parserFor(source.lang)
  if (!parser) throw new Error(`no parser for ${source.lang}`)

  const response = await doFetch(source.url, { signal })
  if (!response.ok || !response.body) {
    throw new Error(`could not download ${source.name}: HTTP ${response.status}`)
  }
  const lastModified = response.headers.get('last-modified')
  const contentLength = Number(response.headers.get('content-length'))
  const total = Number.isFinite(contentLength) && contentLength > 0 ? contentLength : null

  let downloaded = 0
  const counted = response.body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        downloaded += chunk.byteLength
        onProgress?.({ phase: 'download', loaded: downloaded, total })
        controller.enqueue(chunk)
      },
    }),
  )

  // Cast needed because TS's DOM lib types Uint8Array over ArrayBuffer here and
  // ArrayBufferLike in DecompressionStream's own declaration — a lib mismatch,
  // not a real incompatibility; both are the same Uint8Array at runtime.
  const decompressed = counted.pipeThrough(
    new DecompressionStream('gzip') as unknown as ReadableWritablePair<Uint8Array, Uint8Array>,
  )
  const textStream: ReadableStream<string> = decompressed.pipeThrough(
    new TextDecoderStream() as unknown as ReadableWritablePair<string, Uint8Array>,
  )

  // The decompressed source is never held whole — 9.9MB for CC-CEDICT, 63MB for
  // JMdict — only what the parser keeps of the chunks as they arrive.
  const reader = textStream.getReader()
  try {
    for (;;) {
      const { done: streamDone, value } = await reader.read()
      if (streamDone) break
      parser.push(value)
    }
  } finally {
    reader.releaseLock()
  }

  const byHeadword = parser.finish()

  // Records, not keys: a row is shared by reference across every headword it can
  // be looked up under, so the map is larger than the dictionary. CC-CEDICT's
  // 124,911 lines key ~198k headwords and JMdict's 218,607 entries key 465,168,
  // and the count the wizard shows should be the dictionary's, not the index's.
  const records = new Set<DictRow>()
  for (const rows of byHeadword.values()) for (const row of rows) records.add(row)

  // Cleared first: if the writes below fail partway, the store reads as
  // "not installed" rather than as a mix of two versions.
  await clearLangIn(db, source.lang)

  let written = 0
  let chunk = new Map<string, DictRow[]>()
  for (const [headword, defs] of byHeadword) {
    chunk.set(headword, defs)
    if (chunk.size >= DEFS_CHUNK_SIZE) {
      await putDefsChunk(db, source.lang, chunk)
      written += chunk.size
      onProgress?.({ phase: 'import', loaded: written, total: byHeadword.size })
      chunk = new Map()
    }
  }
  if (chunk.size) {
    await putDefsChunk(db, source.lang, chunk)
    written += chunk.size
    onProgress?.({ phase: 'import', loaded: written, total: byHeadword.size })
  }

  await putLexicon(db, source.lang, parser.lexiconText(byHeadword))

  const meta: DictMeta = {
    url: source.url,
    lastModified,
    installedAt: Date.now(),
    entryCount: records.size,
    formatVersion: 2,
  }
  // Last, and in its own transaction: absence of `meta` is what makes a failed
  // or cancelled run read as "not installed" rather than as half a dictionary.
  await putMeta(db, source.lang, meta)
  return meta
}
