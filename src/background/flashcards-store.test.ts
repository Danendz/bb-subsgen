import { describe, expect, test } from 'vitest'
import {
  applyReviewIn,
  captureSentenceIn,
  discoverWordIn,
  importRanksIn,
  knownWordsIn,
  markKnownIn,
  parseRanks,
  recordExposuresIn,
} from './flashcards-store'
import { openFlashcardsDb, request, STORES } from '../flashcards/db'
import {
  sentenceId,
  wordId,
  type Exposure,
  type Item,
  type Review,
  type Video,
  type VideoWord,
} from '../flashcards/types'

async function db(): Promise<IDBDatabase> {
  return openFlashcardsDb(`test-${Math.random()}`)
}

function get<T>(database: IDBDatabase, store: string, key: IDBValidKey): Promise<T | undefined> {
  return request<T | undefined>(
    database.transaction(store, 'readonly').objectStore(store).get(key),
  )
}

const context = (text: string) => ({ text, translation: '', at: 1, url: 'https://example.com' })

const video = { bvid: 'BV1xx', title: 'Test', url: 'https://b.tv/BV1xx' }

describe('recordExposuresIn', () => {
  test('accumulates counts across flushes', async () => {
    const database = await db()
    await recordExposuresIn(database, { lines: 2, words: { 我: 3, 学习: 1 } })
    await recordExposuresIn(database, { lines: 1, words: { 我: 2 } })

    expect((await get<Exposure>(database, STORES.exposures, '我'))?.count).toBe(5)
    expect((await get<Exposure>(database, STORES.exposures, '学习'))?.count).toBe(1)
  })

  test('the read-modify-write survives a batch big enough to span the event loop', async () => {
    // The regression this guards: issuing each put from a promise chained off
    // its get lets the transaction auto-commit first, and the writes vanish
    // with no error anywhere. A single word would not catch it — the failure
    // needs enough requests in flight to actually cross a task boundary.
    const database = await db()
    const words = Object.fromEntries(
      Array.from({ length: 300 }, (_, i) => [`词${i}`, i + 1]),
    )
    await recordExposuresIn(database, { lines: 300, words })

    const store = database.transaction(STORES.exposures, 'readonly').objectStore(STORES.exposures)
    expect(await request<number>(store.count())).toBe(300)
    expect((await get<Exposure>(database, STORES.exposures, '词299'))?.count).toBe(300)
  })

  test('files per-video counts and the video itself', async () => {
    const database = await db()
    await recordExposuresIn(database, { video, lines: 4, words: { 我: 2 } })
    await recordExposuresIn(database, { video, lines: 3, words: { 我: 1 } })

    expect((await get<VideoWord>(database, STORES.videoWords, ['BV1xx', '我']))?.count).toBe(3)
    const stored = await get<Video>(database, STORES.videos, 'BV1xx')
    expect(stored?.lines).toBe(7)
    expect(stored?.firstWatched).toBeLessThanOrEqual(stored!.lastWatched)
  })

  test('a batch with no video touches no video stores', async () => {
    const database = await db()
    await recordExposuresIn(database, { lines: 1, words: { 我: 1 } })
    const store = database.transaction(STORES.videos, 'readonly').objectStore(STORES.videos)
    expect(await request<number>(store.count())).toBe(0)
  })

  test('an empty flush is a no-op rather than an error', async () => {
    const database = await db()
    await expect(recordExposuresIn(database, { lines: 0, words: {} })).resolves.toBeUndefined()
  })
})

describe('discoverWordIn', () => {
  test('creates a schedulable card the first time', async () => {
    const database = await db()
    await discoverWordIn(database, '学习', context('我在学习中文。'))

    const item = await get<Item>(database, STORES.items, wordId('学习'))
    expect(item?.kind).toBe('word')
    expect(item?.state).toBe('new')
    expect(item?.contexts).toHaveLength(1)
  })

  test('a second sighting elsewhere adds a context, not a card', async () => {
    const database = await db()
    await discoverWordIn(database, '学习', context('我在学习中文。'))
    await discoverWordIn(database, '学习', context('他学习得很好。'))

    const item = await get<Item>(database, STORES.items, wordId('学习'))
    expect(item?.contexts.map((c) => c.text)).toEqual(['我在学习中文。', '他学习得很好。'])
  })

  test('meeting the same line twice does not duplicate the context', async () => {
    const database = await db()
    await discoverWordIn(database, '学习', context('我在学习中文。'))
    await discoverWordIn(database, '学习', context('我在学习中文。'))

    expect((await get<Item>(database, STORES.items, wordId('学习')))?.contexts).toHaveLength(1)
  })

  test('never demotes a word you marked known', async () => {
    // Hovering a known word for its definition is not a claim you forgot it.
    const database = await db()
    await markKnownIn(database, '我', true)
    await discoverWordIn(database, '我', context('我很好。'))

    expect((await get<Item>(database, STORES.items, wordId('我')))?.state).toBe('known')
  })

  test('stamps the frequency rank when one has been imported', async () => {
    const database = await db()
    await importRanksIn(database, [{ headword: '学习', rank: 412, hsk: 1 }])
    await discoverWordIn(database, '学习')

    expect((await get<Item>(database, STORES.items, wordId('学习')))?.rank).toBe(412)
  })

  test('works with no rank data at all', async () => {
    const database = await db()
    await discoverWordIn(database, '学习')
    expect((await get<Item>(database, STORES.items, wordId('学习')))?.rank).toBeUndefined()
  })
})

describe('captureSentenceIn', () => {
  test('lands in the pool rather than the deck', async () => {
    const database = await db()
    await captureSentenceIn(database, '我在学习中文。', context('我在学习中文。'))

    const item = await get<Item>(database, STORES.items, sentenceId('我在学习中文。'))
    expect(item?.kind).toBe('sentence')
    expect(item?.state).toBe('pool')
  })

  test('the same line from two videos is one card with two contexts', async () => {
    const database = await db()
    await captureSentenceIn(database, '谢谢你。', { ...context('谢谢你。'), bvid: 'BV1' })
    await captureSentenceIn(database, '谢谢你。', { ...context('谢谢你。'), bvid: 'BV2' })

    const item = await get<Item>(database, STORES.items, sentenceId('谢谢你。'))
    expect(item?.contexts.map((c) => c.bvid)).toEqual(['BV1', 'BV2'])
  })

  test('keeps the cloze target it was captured for', async () => {
    const database = await db()
    await captureSentenceIn(database, '我在学习中文。', context('我在学习中文。'), '学习')
    expect((await get<Item>(database, STORES.items, sentenceId('我在学习中文。')))?.target).toBe(
      '学习',
    )
  })
})

describe('markKnownIn and knownWordsIn', () => {
  test('a declared word is reported known', async () => {
    const database = await db()
    await markKnownIn(database, '我们', true)
    expect(await knownWordsIn(database)).toEqual(['我们'])
  })

  test('un-marking returns the word to the deck as new', async () => {
    // Not to whatever interval it held: "I don't actually know this" is a
    // stronger statement than a stale schedule.
    const database = await db()
    await markKnownIn(database, '我们', true)
    await markKnownIn(database, '我们', false)

    expect(await knownWordsIn(database)).toEqual([])
    const item = await get<Item>(database, STORES.items, wordId('我们'))
    expect(item?.state).toBe('new')
    expect(item?.interval).toBe(0)
  })

  test('marking a word never seen before still works', async () => {
    // The button is on the card, and the card can open for a word that was
    // discovered in the same breath.
    const database = await db()
    await markKnownIn(database, '因为', true)
    expect(await knownWordsIn(database)).toEqual(['因为'])
  })

  test('pooled sentences never appear in the known set', async () => {
    const database = await db()
    await captureSentenceIn(database, '我在学习中文。', context('我在学习中文。'))
    await markKnownIn(database, '我', true)

    expect(await knownWordsIn(database)).toEqual(['我'])
  })
})

describe('applyReviewIn', () => {
  async function seededWord(database: IDBDatabase): Promise<Item> {
    await discoverWordIn(database, '学习', context('我在学习中文。'))
    return (await get<Item>(database, STORES.items, wordId('学习')))!
  }

  test('reschedules the card and logs the review together', async () => {
    // Both in one transaction: a schedule that moved with no log entry behind
    // it is precisely the state the import merge cannot reconstruct, since
    // replaying the log is what makes two histories combinable.
    const database = await db()
    const item = await seededWord(database)
    await applyReviewIn(database, item, 'good', 'recognise', 1_000)

    const stored = await get<Item>(database, STORES.items, wordId('学习'))
    expect(stored?.interval).toBe(1)
    expect(stored?.reps).toBe(1)

    const reviews = await request<Review[]>(
      database.transaction(STORES.reviews, 'readonly').objectStore(STORES.reviews).getAll(),
    )
    expect(reviews).toHaveLength(1)
    expect(reviews[0]).toMatchObject({
      itemId: wordId('学习'),
      grade: 'good',
      style: 'recognise',
      intervalBefore: 0,
      intervalAfter: 1,
    })
  })

  test('stamps introducedAt on the first review and never moves it', async () => {
    // The daily intake limits count these, so a later review resetting it
    // would hand back budget that was already spent.
    const database = await db()
    const first = await applyReviewIn(database, await seededWord(database), 'good', 'recognise', 1_000)
    expect(first.introducedAt).toBe(1_000)

    const second = await applyReviewIn(database, first, 'good', 'recognise', 90_000_000)
    expect(second.introducedAt).toBe(1_000)
  })

  test('the review log accumulates rather than being overwritten', async () => {
    const database = await db()
    let item = await seededWord(database)
    for (const at of [1_000, 2_000, 3_000]) {
      item = await applyReviewIn(database, item, 'good', 'recognise', at)
    }

    const reviews = await request<Review[]>(
      database.transaction(STORES.reviews, 'readonly').objectStore(STORES.reviews).getAll(),
    )
    expect(reviews.map((r) => r.at)).toEqual([1_000, 2_000, 3_000])
  })

  test('a lapse keeps the card in the session', async () => {
    const database = await db()
    const item = await seededWord(database)
    const lapsed = await applyReviewIn(
      database,
      { ...item, interval: 30, reps: 5, state: 'review' },
      'again',
      'type',
      1_000,
    )

    expect(lapsed.interval).toBe(0)
    expect(lapsed.state).toBe('learning')
    expect(lapsed.lapses).toBe(1)
    expect(lapsed.due).toBeLessThan(1_000 + 86_400_000)
  })
})

describe('parseRanks', () => {
  test('reads both columns', () => {
    expect(parseRanks('我\t1\t1\n学习\t412\t2')).toEqual([
      { headword: '我', rank: 1, hsk: 1 },
      { headword: '学习', rank: 412, hsk: 2 },
    ])
  })

  test('tolerates either column being absent', () => {
    // The build emits whichever datasets were present, so a row can carry a
    // frequency rank with no HSK level or the other way round.
    expect(parseRanks('我\t1\t\n专业\t\t5')).toEqual([
      { headword: '我', rank: 1 },
      { headword: '专业', hsk: 5 },
    ])
  })

  test('skips blank lines and rows with no headword', () => {
    expect(parseRanks('\n\t3\t1\n我\t1\t1\n')).toEqual([{ headword: '我', rank: 1, hsk: 1 }])
  })
})
