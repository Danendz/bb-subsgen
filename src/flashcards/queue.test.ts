import { describe, expect, test } from 'vitest'
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

const limits = { newWordsPerDay: 10, newSentencesPerDay: 5 }

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
    const items = [
      word('憔悴', { rank: 22000 }),
      word('因为', { rank: 300 }),
      word('学习', { rank: 412 }),
    ]
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
    const items = [word('生僻'), word('因为', { rank: 300 })]
    expect(buildQueue({ items, now: NOW, ...limits, unknownCount }).map((i) => i.text)).toEqual([
      '因为',
      '生僻',
    ])
  })

  test('respects the daily budget for new words', () => {
    const items = Array.from({ length: 30 }, (_, i) => word(`词${i}`, { rank: i }))
    expect(buildQueue({ items, now: NOW, ...limits, unknownCount })).toHaveLength(10)
  })

  test('counts what was already introduced today against the budget', () => {
    const items = [
      ...Array.from({ length: 8 }, (_, i) =>
        word(`旧${i}`, { rank: i, introducedAt: startOfDay(NOW) + 3600_000, state: 'review', due: NOW + DAY_MS }),
      ),
      ...Array.from({ length: 10 }, (_, i) => word(`新${i}`, { rank: 100 + i })),
    ]
    // Eight already met today leaves room for two more, not ten.
    expect(buildQueue({ items, now: NOW, ...limits, unknownCount })).toHaveLength(2)
  })

  test('yesterday introductions do not count against today', () => {
    const items = [
      word('昨天', { introducedAt: startOfDay(NOW) - 2 * 3600_000, state: 'review', due: NOW + DAY_MS }),
      word('今天', { rank: 5 }),
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
      buildQueue({ items, now: NOW, newWordsPerDay: 1, newSentencesPerDay: 0, unknownCount }),
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
      word('新词', { rank: 1 }),
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
