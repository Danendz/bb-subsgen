import { beforeEach, describe, expect, test } from 'vitest'
import { openLlmDb } from './db'
import {
  clearLogIn,
  DETAIL_LIMIT,
  filterEntries,
  formatLogEntry,
  MAX_LOG_ENTRIES,
  readLogIn,
  truncateDetail,
  writeLogIn,
} from './log'
import type { LlmLogEntry, NewLlmLogEntry } from './types'

function entry(over: Partial<NewLlmLogEntry> = {}): NewLlmLogEntry {
  return {
    level: 'info',
    kind: 'chat',
    requestId: 'abc123',
    message: 'sent',
    ...over,
  }
}

describe('truncateDetail', () => {
  test('leaves a short detail alone', () => {
    expect(truncateDetail('short', false)).toBe('short')
  })

  test('keeps everything when verbose logging is on', () => {
    const long = 'x'.repeat(DETAIL_LIMIT + 100)
    expect(truncateDetail(long, true)).toBe(long)
  })

  test('cuts a long detail and says how much it dropped', () => {
    const long = 'x'.repeat(DETAIL_LIMIT + 100)
    const cut = truncateDetail(long, false)!

    expect(cut.startsWith('x'.repeat(DETAIL_LIMIT))).toBe(true)
    expect(cut).toContain('100 more characters')
  })

  test('passes an absent detail through', () => {
    expect(truncateDetail(undefined, false)).toBeUndefined()
  })
})

describe('formatLogEntry', () => {
  const base: LlmLogEntry = { ...entry(), seq: 1, at: Date.UTC(2026, 0, 2, 3, 4, 5) }

  test('puts the correlating fields on one line', () => {
    const line = formatLogEntry(base)

    expect(line).toContain('2026-01-02T03:04:05')
    expect(line).toContain('INFO')
    expect(line).toContain('chat')
    expect(line).toContain('abc123')
    expect(line).toContain('sent')
  })

  test('includes status and duration when they are known', () => {
    const line = formatLogEntry({ ...base, status: 404, durationMs: 1200, model: 'qwen3' })

    expect(line).toContain('qwen3')
    expect(line).toContain('HTTP 404')
    expect(line).toContain('1200ms')
  })

  test('puts detail on its own line so a body stays readable', () => {
    expect(formatLogEntry({ ...base, detail: 'body' })).toBe(`${formatLogEntry(base)}\nbody`)
  })
})

describe('filterEntries', () => {
  const at = Date.now()
  const rows: LlmLogEntry[] = [
    { ...entry({ level: 'debug', kind: 'chat' }), seq: 1, at },
    { ...entry({ level: 'info', kind: 'translate-batch' }), seq: 2, at },
    { ...entry({ level: 'warn', kind: 'translate-batch' }), seq: 3, at },
    { ...entry({ level: 'error', kind: 'chat' }), seq: 4, at },
  ]

  test('keeps everything by default', () => {
    expect(filterEntries(rows, 'all', 'all')).toHaveLength(4)
  })

  // Asking for warnings and not being shown errors would be the wrong end of the log.
  test('level is a floor, not an equality test', () => {
    expect(filterEntries(rows, 'warn', 'all').map((e) => e.seq)).toEqual([3, 4])
  })

  test('errors only means only errors', () => {
    expect(filterEntries(rows, 'error', 'all').map((e) => e.seq)).toEqual([4])
  })

  test('narrows by kind', () => {
    expect(filterEntries(rows, 'all', 'chat').map((e) => e.seq)).toEqual([1, 4])
  })

  test('combines both', () => {
    expect(filterEntries(rows, 'warn', 'translate-batch').map((e) => e.seq)).toEqual([3])
  })
})

describe('the log store', () => {
  let db: IDBDatabase

  beforeEach(async () => {
    db = await openLlmDb(`llm-log-${Math.random()}`)
  })

  test('reads back what was written, newest first', async () => {
    await writeLogIn(db, entry({ message: 'first' }))
    await writeLogIn(db, entry({ message: 'second' }))

    expect((await readLogIn(db)).map((e) => e.message)).toEqual(['second', 'first'])
  })

  test('stamps each entry with a time and a sequence number', async () => {
    await writeLogIn(db, entry())
    const [written] = await readLogIn(db)

    expect(written.at).toBeGreaterThan(0)
    expect(written.seq).toBe(1)
  })

  test('honours a limit', async () => {
    await writeLogIn(db, entry({ message: 'a' }))
    await writeLogIn(db, entry({ message: 'b' }))
    await writeLogIn(db, entry({ message: 'c' }))

    expect((await readLogIn(db, 2)).map((e) => e.message)).toEqual(['c', 'b'])
  })

  // The cap is what stops a long translation pass filling the disk.
  test('trims the oldest entries once the cap is passed', async () => {
    for (let i = 0; i < MAX_LOG_ENTRIES + 5; i += 1) {
      await writeLogIn(db, entry({ message: `entry-${i}` }))
    }

    const kept = await readLogIn(db)
    expect(kept).toHaveLength(MAX_LOG_ENTRIES)
    expect(kept[0].message).toBe(`entry-${MAX_LOG_ENTRIES + 4}`)
    // The five oldest are gone, not the five newest.
    expect(kept.at(-1)!.message).toBe('entry-5')
  })

  test('clears', async () => {
    await writeLogIn(db, entry())
    await clearLogIn(db)

    expect(await readLogIn(db)).toEqual([])
  })
})
