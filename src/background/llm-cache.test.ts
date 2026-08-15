import { beforeEach, describe, expect, test, vi } from 'vitest'
import { openLlmDb } from '../llm/db'
import {
  cacheSizeIn,
  clearCacheIn,
  evictIn,
  readTrackIn,
  writeLinesIn,
  type TrackKey,
} from './llm-cache'

const KEY: TrackKey = { bvid: 'BV1', lang: 'en', model: 'gemma' }

describe('the translation cache', () => {
  let db: IDBDatabase

  beforeEach(async () => {
    db = await openLlmDb(`llm-cache-${Math.random()}`)
  })

  test('reads back what was written, by cue start', async () => {
    await writeLinesIn(db, KEY, [
      { start: 0, text: 'Hello' },
      { start: 4.5, text: 'Goodbye' },
    ])

    expect(Object.fromEntries(await readTrackIn(db, KEY))).toEqual({ 0: 'Hello', 4.5: 'Goodbye' })
  })

  test('writing the same line again replaces it', async () => {
    await writeLinesIn(db, KEY, [{ start: 0, text: 'first' }])
    await writeLinesIn(db, KEY, [{ start: 0, text: 'second' }])

    expect((await readTrackIn(db, KEY)).get(0)).toBe('second')
  })

  // Two models are not two versions of one answer, and neither is stale.
  test('keeps models apart', async () => {
    await writeLinesIn(db, KEY, [{ start: 0, text: 'from gemma' }])
    await writeLinesIn(db, { ...KEY, model: 'qwen' }, [{ start: 0, text: 'from qwen' }])

    expect((await readTrackIn(db, KEY)).get(0)).toBe('from gemma')
    expect((await readTrackIn(db, { ...KEY, model: 'qwen' })).get(0)).toBe('from qwen')
  })

  test('keeps languages apart', async () => {
    await writeLinesIn(db, KEY, [{ start: 0, text: 'Hello' }])
    await writeLinesIn(db, { ...KEY, lang: 'ru' }, [{ start: 0, text: 'Привет' }])

    expect((await readTrackIn(db, { ...KEY, lang: 'ru' })).get(0)).toBe('Привет')
  })

  test('keeps videos apart', async () => {
    await writeLinesIn(db, KEY, [{ start: 0, text: 'one' }])
    await writeLinesIn(db, { ...KEY, bvid: 'BV2' }, [{ start: 0, text: 'two' }])

    expect((await readTrackIn(db, { ...KEY, bvid: 'BV2' })).get(0)).toBe('two')
  })

  test('an uncached video reads as empty', async () => {
    expect(await readTrackIn(db, KEY)).toEqual(new Map())
  })

  test('writing nothing is not an error', async () => {
    await expect(writeLinesIn(db, KEY, [])).resolves.toBeUndefined()
  })

  test('reports what it is holding', async () => {
    await writeLinesIn(db, KEY, [{ start: 0, text: 'a' }, { start: 1, text: 'b' }])
    await writeLinesIn(db, { ...KEY, bvid: 'BV2' }, [{ start: 0, text: 'c' }])

    expect(await cacheSizeIn(db)).toEqual({ videos: 2, lines: 3 })
  })

  test('clears', async () => {
    await writeLinesIn(db, KEY, [{ start: 0, text: 'a' }])
    await clearCacheIn(db)

    expect(await cacheSizeIn(db)).toEqual({ videos: 0, lines: 0 })
  })
})

describe('eviction', () => {
  let db: IDBDatabase

  beforeEach(async () => {
    db = await openLlmDb(`llm-evict-${Math.random()}`)
  })

  test('does nothing while under the cap', async () => {
    await writeLinesIn(db, KEY, [{ start: 0, text: 'a' }])

    expect(await evictIn(db, 5)).toBe(0)
    expect((await cacheSizeIn(db)).videos).toBe(1)
  })

  test('drops the least recently written videos, whole', async () => {
    let clock = 1000
    vi.spyOn(Date, 'now').mockImplementation(() => (clock += 1000))

    await writeLinesIn(db, { ...KEY, bvid: 'oldest' }, [{ start: 0, text: 'a' }])
    await writeLinesIn(db, { ...KEY, bvid: 'middle' }, [{ start: 0, text: 'b' }])
    await writeLinesIn(db, { ...KEY, bvid: 'newest' }, [{ start: 0, text: 'c' }, { start: 1, text: 'd' }])

    expect(await evictIn(db, 2)).toBe(1)
    vi.restoreAllMocks()

    expect(await readTrackIn(db, { ...KEY, bvid: 'oldest' })).toEqual(new Map())
    expect((await readTrackIn(db, { ...KEY, bvid: 'newest' })).size).toBe(2)
    expect((await cacheSizeIn(db)).videos).toBe(2)
  })

  // A track still being translated is the one video that must not be evicted.
  test('recency comes from the newest line, so a track in progress is safe', async () => {
    let clock = 1000
    vi.spyOn(Date, 'now').mockImplementation(() => (clock += 1000))

    await writeLinesIn(db, { ...KEY, bvid: 'inProgress' }, [{ start: 0, text: 'early' }])
    await writeLinesIn(db, { ...KEY, bvid: 'other' }, [{ start: 0, text: 'b' }])
    // The in-progress track gets another batch, making it the most recent.
    await writeLinesIn(db, { ...KEY, bvid: 'inProgress' }, [{ start: 1, text: 'late' }])

    await evictIn(db, 1)
    vi.restoreAllMocks()

    expect((await readTrackIn(db, { ...KEY, bvid: 'inProgress' })).size).toBe(2)
    expect(await readTrackIn(db, { ...KEY, bvid: 'other' })).toEqual(new Map())
  })
})
