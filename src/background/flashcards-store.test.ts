import { describe, expect, test } from 'vitest'
import {
  applyReviewIn,
  captureSentenceIn,
  discoverWordIn,
  deleteWordListIn,
  knownWordsIn,
  markKnownIn,
  rankMapIn,
  replaceWordListIn,
  recordExposuresIn,
} from './flashcards-store'
import { done, openFlashcardsDb, request, STORES } from '../flashcards/db'
import { studyStreak } from '../flashcards/queries'
import {
  sentenceId,
  wordId,
  type Exposure,
  type Item,
  type Rank,
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

    // The card had no stored level, so its rung came from the interval it had
    // already earned: 30 days is nearest L5. A lapse costs one rung and brings
    // it back inside the sitting.
    expect(lapsed.level).toBe(4)
    expect(lapsed.state).toBe('learning')
    expect(lapsed.lapses).toBe(1)
    expect(lapsed.due).toBeLessThan(1_000 + 86_400_000)
  })
})

describe('word lists', () => {
  const rows = (...words: string[]) => words.map((headword, i) => ({ headword, value: i + 1 }))

  test('a frequency upload is readable as a rank map', async () => {
    const database = await db()
    await replaceWordListIn(database, 'frequency', rows('的', '一', '是'))

    expect(await rankMapIn(database)).toEqual(new Map([['的', 1], ['一', 2], ['是', 3]]))
  })

  test('uploading a frequency list leaves HSK levels alone', async () => {
    // The two lists share a row, so the clearing has to be per field or one
    // upload would silently wipe the other list.
    const database = await db()
    await replaceWordListIn(database, 'hsk', [{ headword: '学习', value: 1 }])
    await replaceWordListIn(database, 'frequency', rows('学习'))

    const stored = await get<Rank>(database, STORES.ranks, '学习')
    expect(stored).toEqual({ headword: '学习', hsk: 1, rank: 1 })
  })

  test('re-uploading drops words the new list does not contain', async () => {
    // Otherwise a word from a replaced list keeps a rank that nothing supports.
    const database = await db()
    await replaceWordListIn(database, 'frequency', rows('的', '憔悴'))
    await replaceWordListIn(database, 'frequency', rows('的'))

    expect(await rankMapIn(database)).toEqual(new Map([['的', 1]]))
  })

  test('deleting one list keeps the other', async () => {
    const database = await db()
    await replaceWordListIn(database, 'hsk', [{ headword: '学习', value: 2 }])
    await replaceWordListIn(database, 'frequency', rows('学习'))
    await deleteWordListIn(database, 'frequency')

    expect(await rankMapIn(database)).toEqual(new Map())
    expect(await get<Rank>(database, STORES.ranks, '学习')).toEqual({ headword: '学习', hsk: 2 })
  })

  test('a row left with neither value is removed, not kept empty', async () => {
    const database = await db()
    await replaceWordListIn(database, 'frequency', rows('的'))
    await deleteWordListIn(database, 'frequency')

    const store = database.transaction(STORES.ranks, 'readonly').objectStore(STORES.ranks)
    expect(await request<number>(store.count())).toBe(0)
  })
})

describe('studyStreak', () => {
  const AT_NOON = (daysAgo: number, now: number) => {
    const date = new Date(now)
    date.setDate(date.getDate() - daysAgo)
    date.setHours(12, 0, 0, 0)
    return date.getTime()
  }

  async function logReviews(database: IDBDatabase, now: number, daysAgo: number[]) {
    const tx = database.transaction(STORES.reviews, 'readwrite')
    for (const days of daysAgo) {
      tx.objectStore(STORES.reviews).put({
        itemId: 'w:学',
        at: AT_NOON(days, now),
        grade: 'good',
        style: 'recognise',
        intervalBefore: 0,
        intervalAfter: 1,
      })
    }
    await done(tx)
  }

  const NOW = Date.UTC(2026, 7, 12, 18, 0, 0)

  test('an empty log is not a streak', async () => {
    expect(await studyStreak(await db(), NOW)).toBe(0)
  })

  test('counts consecutive days back from today', async () => {
    const database = await db()
    await logReviews(database, NOW, [0, 1, 2, 3])
    expect(await studyStreak(database, NOW)).toBe(4)
  })

  test('several reviews on one day are still one day', async () => {
    const database = await db()
    await logReviews(database, NOW, [0, 0, 0, 1, 1])
    expect(await studyStreak(database, NOW)).toBe(2)
  })

  test('stops at the first missing day', async () => {
    const database = await db()
    await logReviews(database, NOW, [0, 1, 3, 4, 5])
    expect(await studyStreak(database, NOW)).toBe(2)
  })

  test('a streak survives until today is over', async () => {
    // Opening the app in the morning before studying must not read as a broken
    // streak — you have not missed the day yet.
    const database = await db()
    await logReviews(database, NOW, [1, 2, 3])
    expect(await studyStreak(database, NOW)).toBe(3)
  })

  test('a log that stops before yesterday has lapsed', async () => {
    const database = await db()
    await logReviews(database, NOW, [2, 3, 4])
    expect(await studyStreak(database, NOW)).toBe(0)
  })
})
