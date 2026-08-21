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
import { buildLexiconText, groupByHeadword, parseCedictLine, type CedictEntry } from './cedict'
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

  // The 9.9MB decompressed source is never held whole — only the entries
  // parsed out of it, line by line, as the stream delivers them.
  const entries: CedictEntry[] = []
  let buffer = ''
  const reader = textStream.getReader()
  try {
    for (;;) {
      const { done: streamDone, value } = await reader.read()
      if (streamDone) break
      buffer += value
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        const entry = parseCedictLine(line)
        if (entry) entries.push(entry)
      }
    }
    const last = parseCedictLine(buffer)
    if (last) entries.push(last)
  } finally {
    reader.releaseLock()
  }

  const byHeadword = groupByHeadword(entries)

  // Cleared first: if the writes below fail partway, the store reads as
  // "not installed" rather than as a mix of two versions.
  await clearLangIn(db, source.lang)

  let written = 0
  let chunk = new Map<string, CedictEntry[]>()
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

  await putLexicon(db, source.lang, buildLexiconText(byHeadword))

  const meta: DictMeta = {
    url: source.url,
    lastModified,
    installedAt: Date.now(),
    entryCount: entries.length,
    formatVersion: 2,
  }
  // Last, and in its own transaction: absence of `meta` is what makes a failed
  // or cancelled run read as "not installed" rather than as half a dictionary.
  await putMeta(db, source.lang, meta)
  return meta
}
