import { describe, expect, test } from 'vitest'
import { deckCounts, hskProgress, knownSetOf, listItems, listRanks, videoWords } from './queries'
import { openFlashcardsDb, STORES } from './db'
import { done } from '../shared/idb'
import { MATURE_INTERVAL_DAYS } from './known'
import type { Item, Rank } from './types'

function item(partial: Partial<Item> & Pick<Item, 'id' | 'kind' | 'text'>): Item {
  return {
    lang: 'zh',
    state: 'new',
    interval: 0,
    ease: 2.5,
    due: 0,
    reps: 0,
    lapses: 0,
    createdAt: 0,
    contexts: [],
    ...partial,
  }
}

const word = (text: string, extra: Partial<Item> = {}) =>
  item({ id: `w:zh:${text}`, kind: 'word', text, ...extra })

const sentence = (text: string, extra: Partial<Item> = {}) =>
  item({ id: `s:zh:${text}`, kind: 'sentence', text, state: 'pool', ...extra })

describe('knownSetOf', () => {
  test('collects declared and matured words, and nothing else', () => {
    const items = [
      word('我', { state: 'known' }),
      word('学习', { state: 'review', interval: MATURE_INTERVAL_DAYS }),
      word('憔悴', { state: 'review', interval: 3 }),
      word('忧郁'),
      sentence('我在学习中文。'),
    ]
    expect([...knownSetOf(items)]).toEqual(['我', '学习'])
  })
})

describe('deckCounts', () => {
  test('counts words, known words, sentences and the pool separately', () => {
    const items = [
      word('我', { state: 'known' }),
      word('学习', { state: 'review', interval: 40 }),
      word('忧郁'),
      sentence('我在学习中文。'),
      sentence('他很好。', { state: 'new' }),
    ]
    expect(deckCounts(items)).toEqual({
      words: 3,
      known: 2,
      sentences: 2,
      grammar: 0,
      pool: 1,
    })
  })

  test('only lines are counted as waiting', () => {
    // Words no longer have an intake pool: every one collected is studiable at
    // once, so "words collected" minus "known" is the whole story about them.
    const items = [word('忧郁'), word('憔悴'), word('学习'), sentence('我在学习中文。')]
    expect(deckCounts(items)).toMatchObject({ words: 3, pool: 1, sentences: 1 })
  })

  test('a word never studied still counts as collected', () => {
    // The aside's "words collected" is about what capture has found, not
    // about what has been met.
    expect(deckCounts([word('忧郁')])).toMatchObject({ words: 1, known: 0 })
  })

  test('an empty deck counts to zero rather than throwing', () => {
    expect(deckCounts([])).toEqual({
      words: 0,
      known: 0,
      sentences: 0,
      grammar: 0,
      pool: 0,
    })
  })
})

describe('hskProgress', () => {
  const ranks: Rank[] = [
    { lang: 'zh', headword: '我', hsk: 1, rank: 1 },
    { lang: 'zh', headword: '你', hsk: 1, rank: 2 },
    { lang: 'zh', headword: '学习', hsk: 2, rank: 412 },
    // No HSK level — carries a frequency rank only, as most words do.
    { lang: 'zh', headword: '憔悴', rank: 20000 },
  ]

  test('reports known against the level total, ordered by level', () => {
    expect(hskProgress(ranks, new Set(['我', '学习']))).toEqual([
      { level: 1, known: 1, total: 2 },
      { level: 2, known: 1, total: 1 },
    ])
  })

  test('ignores words with no HSK level', () => {
    // Otherwise the denominator would silently include every ranked word and
    // the levels would never fill up.
    const levels = hskProgress(ranks, new Set())
    expect(levels.reduce((sum, l) => sum + l.total, 0)).toBe(3)
  })

  test('is empty when no HSK dataset was built in', () => {
    // The app renders nothing at all rather than a chart of zeroes.
    expect(hskProgress([{ lang: 'zh', headword: '我', rank: 1 }], new Set())).toEqual([])
    expect(hskProgress([], new Set())).toEqual([])
  })
})

describe('deckCounts with grammar', () => {
  const item = (over: Partial<Item> & Pick<Item, 'id' | 'kind' | 'text'>): Item => ({
    lang: 'zh',
    state: 'pool',
    interval: 0,
    ease: 2.5,
    due: 0,
    reps: 0,
    lapses: 0,
    createdAt: 0,
    contexts: [],
    ...over,
  })

  // Grammar used to fall through to the sentence branch, which made the
  // aside's "sentences" tile silently count structures as lines.
  test('counts patterns as their own kind, not as lines', () => {
    const counts = deckCounts([
      item({ id: 's:1', kind: 'sentence', text: '我很累。' }),
      item({ id: 'g:de-complement', kind: 'grammar', text: 'V + 得 + how' }),
    ])

    expect(counts.sentences).toBe(1)
    expect(counts.grammar).toBe(1)
  })

  test('counts pooled patterns as waiting, alongside pooled lines', () => {
    const counts = deckCounts([
      item({ id: 's:1', kind: 'sentence', text: '我很累。' }),
      item({ id: 'g:de-complement', kind: 'grammar', text: 'V + 得 + how' }),
      item({ id: 'g:shi-de', kind: 'grammar', text: '是 … 的', state: 'new' }),
    ])

    expect(counts.pool).toBe(2)
  })
})

/**
 * A deck holding both languages' 生 — the collision the language filter exists
 * for. The Chinese card is known and the Japanese one is new, so a read that
 * merges them is visible as a wrong answer and not just a wrong count.
 */
async function seedBothLanguages(name: string): Promise<IDBDatabase> {
  const db = await openFlashcardsDb(name)

  const tx = db.transaction([STORES.items, STORES.ranks, STORES.videoWords], 'readwrite')
  const items = tx.objectStore(STORES.items)
  items.put(item({ id: 'w:zh:生', kind: 'word', text: '生', state: 'known' }))
  items.put(item({ id: 'w:ja:生', kind: 'word', text: '生', lang: 'ja' }))

  const ranks = tx.objectStore(STORES.ranks)
  ranks.put({ lang: 'zh', headword: '生', rank: 40, hsk: 1 } satisfies Rank)
  ranks.put({ lang: 'zh', headword: '學', rank: 90, hsk: 1 } satisfies Rank)
  ranks.put({ lang: 'ja', headword: '生', rank: 12, hsk: 1 } satisfies Rank)

  const videoWords = tx.objectStore(STORES.videoWords)
  videoWords.put({ videoId: 'BV1', lang: 'zh', headword: '生', count: 3 })
  videoWords.put({ videoId: 'BV1', lang: 'ja', headword: '生', count: 5 })
  videoWords.put({ videoId: 'BV2', lang: 'ja', headword: '猫', count: 2 })

  await done(tx)
  return db
}

describe('listItems', () => {
  test('a Japanese 生 is not a Chinese card, however the deck was collected', async () => {
    const db = await seedBothLanguages('lang-filter-items')

    expect((await listItems(db, 'ja')).map((i) => i.id)).toEqual(['w:ja:生'])
    // The known set is what the overlay stops annotating on. Reading the merged
    // deck would make 生 known in Japanese because it is known in Chinese.
    expect([...knownSetOf(await listItems(db, 'ja'))]).toEqual([])
    expect([...knownSetOf(await listItems(db, 'zh'))]).toEqual(['生'])
  })
})

describe('listRanks', () => {
  test("counts one language's frequency list, not both stacked into one chart", async () => {
    const db = await seedBothLanguages('lang-filter-ranks')

    const zh = await listRanks(db, 'zh')
    expect(zh.map((r) => r.headword).sort()).toEqual(['學', '生'])
    expect(hskProgress(zh, knownSetOf(await listItems(db, 'zh')))).toEqual([
      { level: 1, known: 1, total: 2 },
    ])
  })
})

describe('videoWords', () => {
  test('scores a video against the words it was actually watched in', async () => {
    const db = await seedBothLanguages('lang-filter-video-words')

    expect(await videoWords(db, 'BV1', 'ja')).toEqual([
      { videoId: 'BV1', lang: 'ja', headword: '生', count: 5 },
    ])
    // A video watched only in the other language reads as no words at all,
    // which is what lets the Videos list leave it out.
    expect(await videoWords(db, 'BV2', 'zh')).toEqual([])
  })
})
