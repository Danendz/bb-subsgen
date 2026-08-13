import { beforeEach, describe, expect, test } from 'vitest'
import { buildQueue, queueCounts } from './queue'
import { DAY_MS, startOfDay } from './scheduler'
import type { Item } from './types'

const NOW = Date.UTC(2026, 7, 12, 12, 0, 0)

function make(partial: Partial<Item> & Pick<Item, 'id' | 'kind' | 'text'>): Item {
  return {
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
  make({ id: `w:${text}`, kind: 'word', text, ...extra })

const sentence = (text: string, extra: Partial<Item> = {}) =>
  make({ id: `s:${text}`, kind: 'sentence', text, state: 'pool', ...extra })

/** Everything unknown unless the test says otherwise. */
const unknownCount = (item: Item) => (item.text.match(/\d+/)?.[0] ? Number(item.text.match(/\d+/)![0]) : 1)

/** Ranks live outside the card now, exactly as an uploaded list does. */
const RANKS = new Map<string, number>()
const rankOf = (headword: string) => RANKS.get(headword)

const limits = { newWordsPerDay: 10, newSentencesPerDay: 5, rankOf }

beforeEach(() => RANKS.clear())

describe('buildQueue', () => {
  test('serves cards that came due, oldest first', () => {
    const items = [
      word('新', { state: 'review', due: NOW - DAY_MS }),
      word('旧', { state: 'review', due: NOW - 5 * DAY_MS }),
    ]
    expect(buildQueue({ items, now: NOW, ...limits, unknownCount }).map((i) => i.text)).toEqual([
      '旧',
      '新',
    ])
  })

  test('leaves cards that are not due yet alone', () => {
    const items = [word('明天', { state: 'review', due: NOW + DAY_MS })]
    expect(buildQueue({ items, now: NOW, ...limits, unknownCount })).toEqual([])
  })

  test('puts due cards ahead of new material', () => {
    // Reviews are debt already owed. New cards added ahead of them is how a
    // deck acquires a backlog it can never clear.
    const items = [word('新词'), word('复习', { state: 'review', due: NOW - DAY_MS })]
    expect(buildQueue({ items, now: NOW, ...limits, unknownCount }).map((i) => i.text)).toEqual([
      '复习',
      '新词',
    ])
  })

  test('introduces new words most frequent first', () => {
    RANKS.set('憔悴', 22000).set('因为', 300).set('学习', 412)
    const items = [word('憔悴'), word('因为'), word('学习')]
    expect(buildQueue({ items, now: NOW, ...limits, unknownCount }).map((i) => i.text)).toEqual([
      '因为',
      '学习',
      '憔悴',
    ])
  })

  test('sorts unranked words last rather than first', () => {
    // No rank means the word is outside the frequency list, which is evidence
    // of rarity. Treating it as rank 0 would promote exactly the obscure
    // vocabulary the ordering exists to defer.
    RANKS.set('因为', 300)
    const items = [word('生僻'), word('因为')]
    expect(buildQueue({ items, now: NOW, ...limits, unknownCount }).map((i) => i.text)).toEqual([
      '因为',
      '生僻',
    ])
  })

  test('respects the daily budget for new words', () => {
    const items = Array.from({ length: 30 }, (_, i) => {
      RANKS.set(`词${i}`, i)
      return word(`词${i}`)
    })
    expect(buildQueue({ items, now: NOW, ...limits, unknownCount })).toHaveLength(10)
  })

  test('counts what was already introduced today against the budget', () => {
    const items = [
      ...Array.from({ length: 8 }, (_, i) =>
        word(`旧${i}`, { introducedAt: startOfDay(NOW) + 3600_000, state: 'review', due: NOW + DAY_MS }),
      ),
      ...Array.from({ length: 10 }, (_, i) => word(`新${i}`)),
    ]
    // Eight already met today leaves room for two more, not ten.
    expect(buildQueue({ items, now: NOW, ...limits, unknownCount })).toHaveLength(2)
  })

  test('yesterday introductions do not count against today', () => {
    const items = [
      word('昨天', { introducedAt: startOfDay(NOW) - 2 * 3600_000, state: 'review', due: NOW + DAY_MS }),
      word('今天'),
    ]
    expect(buildQueue({ items, now: NOW, ...limits, unknownCount }).map((i) => i.text)).toEqual([
      '今天',
    ])
  })

  test('never serves a word twice, once introduced', () => {
    const items = [word('学习', { introducedAt: NOW - DAY_MS, state: 'review', due: NOW + DAY_MS })]
    expect(buildQueue({ items, now: NOW, ...limits, unknownCount })).toEqual([])
  })

  test('takes the most comprehensible sentences out of the pool', () => {
    // A line where you know all but one word is the most learnable thing
    // collected; one with six unknowns burns a review and teaches nothing.
    const items = [sentence('难6'), sentence('易1'), sentence('中3')]
    const queue = buildQueue({
      items,
      now: NOW,
      newWordsPerDay: 0,
      newSentencesPerDay: 2,
      unknownCount,
      rankOf,
    })
    expect(queue.map((i) => i.text)).toEqual(['易1', '中3'])
  })

  test('a big pool still only yields the daily limit', () => {
    // The reason capture can afford to be generous: an evening's watching can
    // pool hundreds of lines and the deck still grows by five.
    const items = Array.from({ length: 400 }, (_, i) => sentence(`句${(i % 9) + 1}`))
    const queue = buildQueue({ items, now: NOW, ...limits, unknownCount })
    expect(queue).toHaveLength(5)
  })

  test('a spent budget yields nothing rather than going negative', () => {
    const items = [
      word('已见', { introducedAt: NOW - 1000, state: 'review', due: NOW + DAY_MS }),
      word('待见'),
    ]
    expect(
      buildQueue({ items, now: NOW, newWordsPerDay: 1, newSentencesPerDay: 0, unknownCount, rankOf }),
    ).toEqual([])
  })

  test('learning cards come back within the session', () => {
    const items = [word('刚忘', { state: 'learning', due: NOW - 60_000, interval: 0 })]
    expect(buildQueue({ items, now: NOW, ...limits, unknownCount }).map((i) => i.text)).toEqual([
      '刚忘',
    ])
  })

  test('known words are never scheduled', () => {
    const items = [word('我', { state: 'known', due: NOW - DAY_MS })]
    expect(buildQueue({ items, now: NOW, ...limits, unknownCount })).toEqual([])
  })
})

describe('queueCounts', () => {
  test('breaks the session down before it starts', () => {
    const items = [
      word('复习', { state: 'review', due: NOW - DAY_MS }),
      word('新词'),
      sentence('句1'),
      sentence('句2'),
    ]
    expect(queueCounts({ items, now: NOW, ...limits, unknownCount })).toEqual({
      due: 1,
      newWords: 1,
      newSentences: 2,
      pooled: 2,
    })
  })

  test('reports the whole pool, not just what will be introduced', () => {
    // The pool being large is normal and expected; the app has to be able to
    // say so rather than looking like it lost everything.
    const items = Array.from({ length: 50 }, (_, i) => sentence(`句${i}`))
    const counts = queueCounts({ items, now: NOW, ...limits, unknownCount })
    expect(counts.pooled).toBe(50)
    expect(counts.newSentences).toBe(5)
  })
})

describe('include', () => {
  const mixed = () => [
    word('复习', { state: 'review', due: NOW - DAY_MS }),
    word('新词'),
    sentence('句子'),
  ]

  test('words only leaves sentences out entirely', () => {
    const queue = buildQueue({ items: mixed(), now: NOW, ...limits, unknownCount, include: 'words' })
    expect(queue.every((item) => item.kind === 'word')).toBe(true)
    expect(queue.map((i) => i.text)).toEqual(['复习', '新词'])
  })

  test('sentences only leaves words out entirely', () => {
    const queue = buildQueue({
      items: mixed(),
      now: NOW,
      ...limits,
      unknownCount,
      include: 'sentences',
    })
    expect(queue.map((i) => i.text)).toEqual(['句子'])
  })

  test('both is the default, so callers that do not care are unaffected', () => {
    const items = mixed()
    expect(buildQueue({ items, now: NOW, ...limits, unknownCount })).toEqual(
      buildQueue({ items, now: NOW, ...limits, unknownCount, include: 'both' }),
    )
  })

  test('counts follow the filter, so the number matches what you would study', () => {
    const counts = queueCounts({
      items: mixed(),
      now: NOW,
      ...limits,
      unknownCount,
      include: 'words',
    })
    expect(counts).toEqual({ due: 1, newWords: 1, newSentences: 0, pooled: 0 })
  })

  test('a kind you excluded today keeps tomorrow’s intake for the other kind', () => {
    // Budgets are counted per kind, so studying only words cannot quietly spend
    // the sentence allowance.
    const items = [word('新词'), sentence('句1'), sentence('句2')]
    const wordsOnly = queueCounts({ items, now: NOW, ...limits, unknownCount, include: 'words' })
    const everything = queueCounts({ items, now: NOW, ...limits, unknownCount })
    expect(wordsOnly.newWords).toBe(everything.newWords)
  })
})

describe('limit', () => {
  const backlog = () =>
    Array.from({ length: 40 }, (_, i) =>
      word(`旧${i}`, { state: 'review', due: NOW - (40 - i) * DAY_MS }),
    )

  test('caps the session at the requested number of cards', () => {
    expect(buildQueue({ items: backlog(), now: NOW, ...limits, unknownCount, limit: 5 })).toHaveLength(5)
  })

  test('keeps the top of the queue, not a sample of it', () => {
    // A short session on a backlog is the most overdue cards, in order — the
    // cap is applied after the priority ordering, never instead of it.
    const queue = buildQueue({ items: backlog(), now: NOW, ...limits, unknownCount, limit: 3 })
    expect(queue.map((i) => i.text)).toEqual(['旧0', '旧1', '旧2'])
  })

  test('a backlog crowds out new material rather than adding to it', () => {
    const items = [...backlog(), word('新词')]
    const queue = buildQueue({ items, now: NOW, ...limits, unknownCount, limit: 10 })
    expect(queue.some((item) => item.state === 'new')).toBe(false)
  })

  test('asking for more than exists gives what exists', () => {
    const items = [word('复习', { state: 'review', due: NOW - DAY_MS })]
    expect(buildQueue({ items, now: NOW, ...limits, unknownCount, limit: 50 })).toHaveLength(1)
  })

  test('counts report what is available, not what the cap allows', () => {
    // The shortfall is the one thing about a backlog worth seeing.
    const counts = queueCounts({ items: backlog(), now: NOW, ...limits, unknownCount, limit: 5 })
    expect(counts.due).toBe(40)
  })
})
