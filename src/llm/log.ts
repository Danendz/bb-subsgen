// The LLM debug log.
//
// On disk rather than in memory because the service worker is torn down the
// moment it goes idle, and a background translation pass is exactly the thing
// you want a record of after it has stopped running. Both the worker and the
// app write here directly — they share an origin, so there is no message hop.
//
// Writing to it must never be able to break what it is observing: every entry
// is also mirrored to the console, and a failed write is swallowed.

import { done, request } from '../shared/idb'
import { llmDb, STORES } from './db'
import type { LlmLogEntry, LlmLogKind, LlmLogLevel, NewLlmLogEntry } from './types'

/**
 * How many entries are kept.
 *
 * A full translation pass logs two entries per batch, so 500 covers roughly
 * ten videos' worth of history — enough to still find the failure that made you
 * open the log, and far short of anything worth paging through.
 */
export const MAX_LOG_ENTRIES = 500

/** How much of a prompt or response body is kept when verbose logging is off. */
export const DETAIL_LIMIT = 2000

export function truncateDetail(detail: string | undefined, verbose: boolean): string | undefined {
  if (detail === undefined) return undefined
  if (verbose || detail.length <= DETAIL_LIMIT) return detail
  return `${detail.slice(0, DETAIL_LIMIT)}\n… ${detail.length - DETAIL_LIMIT} more characters (turn on verbose logging to keep them)`
}

/** One entry as a single line, for the viewer's copy-all button. */
export function formatLogEntry(entry: LlmLogEntry): string {
  const time = new Date(entry.at).toISOString()
  const parts = [time, entry.level.toUpperCase(), entry.kind, entry.requestId]
  if (entry.model) parts.push(entry.model)
  if (entry.status !== undefined) parts.push(`HTTP ${entry.status}`)
  if (entry.durationMs !== undefined) parts.push(`${entry.durationMs}ms`)
  parts.push(entry.message)

  const line = parts.join(' | ')
  return entry.detail ? `${line}\n${entry.detail}` : line
}

/** Ordered, so a level filter means "this and worse" rather than "exactly this". */
const SEVERITY: Record<LlmLogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 }

/**
 * The viewer's filter.
 *
 * Level is a floor rather than an equality test: asking for warnings and being
 * shown warnings but not errors would be the wrong end of the log.
 */
export function filterEntries(
  entries: LlmLogEntry[],
  level: LlmLogLevel | 'all',
  kind: LlmLogKind | 'all',
): LlmLogEntry[] {
  return entries.filter(
    (entry) =>
      (level === 'all' || SEVERITY[entry.level] >= SEVERITY[level]) &&
      (kind === 'all' || entry.kind === kind),
  )
}

const CONSOLE_FOR: Record<LlmLogLevel, (...args: unknown[]) => void> = {
  debug: console.debug,
  info: console.info,
  warn: console.warn,
  error: console.error,
}

/**
 * Mirrors an entry to the console, so devtools shows it live without the app open.
 *
 * Uses the same `[bb-subsgen]` prefix as the rest of the extension — a log you
 * have to know a second prefix to grep for is a log you will not grep for.
 */
function mirror(entry: NewLlmLogEntry): void {
  const write = CONSOLE_FOR[entry.level] ?? console.log
  write(`[bb-subsgen] llm ${entry.kind}/${entry.requestId}: ${entry.message}`, entry.detail ?? '')
}

/** Drops the oldest entries, issued synchronously so the transaction stays alive. */
function trimIn(store: IDBObjectStore, max: number): void {
  const counted = store.count()
  counted.onsuccess = () => {
    let excess = counted.result - max
    if (excess <= 0) return

    // Ascending primary key is insertion order, so this walks oldest-first.
    const cursor = store.openCursor()
    cursor.onsuccess = () => {
      const at = cursor.result
      if (!at || excess <= 0) return
      at.delete()
      excess -= 1
      at.continue()
    }
  }
}

export async function writeLogIn(db: IDBDatabase, entry: NewLlmLogEntry): Promise<void> {
  const tx = db.transaction(STORES.log, 'readwrite')
  const store = tx.objectStore(STORES.log)
  store.add({ ...entry, at: Date.now() })
  trimIn(store, MAX_LOG_ENTRIES)
  await done(tx)
}

/** Newest first, because that is the end you are ever looking at. */
export async function readLogIn(db: IDBDatabase, limit = MAX_LOG_ENTRIES): Promise<LlmLogEntry[]> {
  const tx = db.transaction(STORES.log, 'readonly')
  const all = (await request(tx.objectStore(STORES.log).getAll())) as LlmLogEntry[]
  return all.reverse().slice(0, limit)
}

export async function clearLogIn(db: IDBDatabase): Promise<void> {
  const tx = db.transaction(STORES.log, 'readwrite')
  tx.objectStore(STORES.log).clear()
  await done(tx)
}

export async function readLog(limit?: number): Promise<LlmLogEntry[]> {
  return readLogIn(await llmDb(), limit)
}

export async function clearLog(): Promise<void> {
  return clearLogIn(await llmDb())
}

/**
 * Records an entry. Fire-and-forget by design.
 *
 * Nothing awaits this and nothing may throw out of it: a request that worked
 * must not be reported as failed because the log could not be written.
 */
export function log(entry: NewLlmLogEntry): void {
  mirror(entry)
  void llmDb()
    .then((db) => writeLogIn(db, entry))
    .catch((e) => {
      console.warn('[bb-subsgen] llm log write failed', e)
    })
}
