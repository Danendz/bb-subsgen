import { beforeEach, describe, expect, test } from 'vitest'
import { buildQueue, buildSession, queueCounts } from './queue'
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

describe('the word pool', () => {
  /** A word collected passively from a line, rather than stopped on. */
  const pooled = (text: string, extra: Partial<Item> = {}) =>
    word(text, { state: 'pool', ...extra })

  const SEEN = new Map<string, number>()
  const seenCount = (headword: string) => SEEN.get(headword) ?? 0
  beforeEach(() => SEEN.clear())

  test('pooled words are eligible for the day’s budget', () => {
    const items = [pooled('憔悴')]
    expect(
      buildQueue({ items, now: NOW, ...limits, unknownCount, seenCount }).map((i) => i.text),
    ).toEqual(['憔悴'])
  })

  test('words you stopped on fill the budget before the pool does', () => {
    // Hovering is a deliberate act and a rare one. It also means a deck
    // collected before words had a pool is served in exactly the order it
    // always was — the pool adds to the tail, it does not reshuffle.
    SEEN.set('那', 500)
    const items = [pooled('那'), word('憔悴')]
    expect(
      buildQueue({
        items,
        now: NOW,
        ...limits,
        newWordsPerDay: 1,
        unknownCount,
        seenCount,
      }).map((i) => i.text),
    ).toEqual(['憔悴'])
  })

  test('the pool is ordered by how often you have actually met the word', () => {
    SEEN.set('那', 500).set('因为', 120).set('憔悴', 2)
    const items = [pooled('憔悴'), pooled('那'), pooled('因为')]
    expect(
      buildQueue({ items, now: NOW, ...limits, unknownCount, seenCount }).map((i) => i.text),
    ).toEqual(['那', '因为', '憔悴'])
  })

  test('frequency rank breaks a tie on exposure', () => {
    RANKS.set('因为', 300).set('憔悴', 22000)
    const items = [pooled('憔悴'), pooled('因为')]
    expect(
      buildQueue({ items, now: NOW, ...limits, unknownCount, seenCount }).map((i) => i.text),
    ).toEqual(['因为', '憔悴'])
  })

  test('exposure order works with no word list uploaded', () => {
    // The whole reason the pool leads on exposure rather than rank: a list is
    // uploaded whenever the user gets round to it, and until then rank is empty
    // for every word — leaving discovery order, which is arbitrary.
    SEEN.set('那', 90).set('憔悴', 1)
    const items = [pooled('憔悴', { createdAt: 1 }), pooled('那', { createdAt: 2 })]
    expect(RANKS.size).toBe(0)
    expect(
      buildQueue({ items, now: NOW, ...limits, unknownCount, seenCount }).map((i) => i.text),
    ).toEqual(['那', '憔悴'])
  })

  test('the daily budget covers both halves together', () => {
    // Not a budget each. Ten new words a day is the promise, however they were
    // collected.
    const items = [word('甲'), word('乙'), pooled('丙'), pooled('丁')]
    expect(
      buildQueue({
        items,
        now: NOW,
        ...limits,
        newWordsPerDay: 3,
        unknownCount,
        seenCount,
      }),
    ).toHaveLength(3)
  })

  test('a pooled word already introduced is not offered again', () => {
    const items = [pooled('憔悴', { introducedAt: NOW - DAY_MS })]
    expect(buildQueue({ items, now: NOW, ...limits, unknownCount, seenCount })).toEqual([])
  })

  test('due cards still come before anything from the pool', () => {
    SEEN.set('那', 500)
    const items = [pooled('那'), word('复习', { state: 'review', due: NOW - DAY_MS })]
    expect(
      buildQueue({ items, now: NOW, ...limits, unknownCount, seenCount }).map((i) => i.text),
    ).toEqual(['复习', '那'])
  })

  test('an absent seenCount leaves the old behaviour untouched', () => {
    // Every caller before the pool existed omits it, and a deck with no pooled
    // words must build exactly the queue it used to.
    const items = [word('甲'), word('乙', { state: 'review', due: NOW - DAY_MS })]
    expect(buildQueue({ items, now: NOW, ...limits, unknownCount }).map((i) => i.text)).toEqual([
      '乙',
      '甲',
    ])
  })

  test('pooled words count towards what the start screen promises', () => {
    const items = [word('甲'), pooled('乙')]
    expect(queueCounts({ items, now: NOW, ...limits, unknownCount, seenCount }).newWords).toBe(2)
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
      practice: 0,
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
    expect(counts).toEqual({ due: 1, newWords: 1, newSentences: 0, pooled: 0, practice: 0 })
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

describe('practice', () => {
  /** In the deck, answered before, not due for a while. */
  const settled = (text: string, extra: Partial<Item> = {}) =>
    word(text, {
      state: 'review',
      interval: 7,
      introducedAt: NOW - 30 * DAY_MS,
      due: NOW + 7 * DAY_MS,
      ...extra,
    })

  test('fills the rest of the session once the scheduled cards run out', () => {
    const items = [word('复习', { state: 'review', due: NOW - DAY_MS }), settled('练习')]
    const queue = buildQueue({ items, now: NOW, ...limits, unknownCount, limit: 5 })
    expect(queue.map((i) => i.text)).toEqual(['复习', '练习'])
  })

  test('gives a session on a day when nothing at all is owed', () => {
    // The whole point: a deck of collected cards you cannot open is how the
    // habit stops, and the streak stops with it.
    const items = Array.from({ length: 40 }, (_, i) => settled(`旧${i}`))
    expect(buildQueue({ items, now: NOW, ...limits, unknownCount, limit: 20 })).toHaveLength(20)
  })

  test('never displaces a card that is actually owed', () => {
    const items = [...Array.from({ length: 8 }, (_, i) => settled(`旧${i}`)), word('新词')]
    const queue = buildQueue({ items, now: NOW, ...limits, unknownCount, limit: 3 })
    expect(queue[0].text).toBe('新词')
  })

  test('is not drawn at all without a session size to fill', () => {
    // Asking for the whole queue is asking what is owed, and nothing here is.
    const items = [settled('练习')]
    expect(buildQueue({ items, now: NOW, ...limits, unknownCount })).toEqual([])
  })

  test('leaves the intake pool alone, so the daily budget stays the only door', () => {
    // A short session on a big pool must stay short. Topping it up from the
    // pool would let drilling introduce material: `applyReviewIn` sets
    // introducedAt on first review, so failing a drilled pooled word would
    // quietly spend a slot of today's intake.
    const items = [
      ...Array.from({ length: 30 }, (_, i) => word(`余${i}`, { state: 'pool' })),
      ...Array.from({ length: 30 }, (_, i) => sentence(`余句${i}`)),
    ]
    const queue = buildQueue({ items, now: NOW, ...limits, unknownCount, limit: 40 })
    expect(queue).toHaveLength(limits.newWordsPerDay + limits.newSentencesPerDay)
  })

  test('leaves declared-known words alone', () => {
    const items = [settled('我', { state: 'known' }), settled('练习')]
    const queue = buildQueue({ items, now: NOW, ...limits, unknownCount, limit: 10 })
    expect(queue.map((i) => i.text)).toEqual(['练习'])
  })

  test('leaves cards that were never introduced alone', () => {
    const items = [settled('幽灵', { introducedAt: undefined }), settled('练习')]
    const queue = buildQueue({ items, now: NOW, ...limits, unknownCount, limit: 10 })
    expect(queue.map((i) => i.text)).toEqual(['练习'])
  })

  test('never serves a due card twice', () => {
    const items = [word('复习', { state: 'review', interval: 7, introducedAt: 0, due: NOW - DAY_MS })]
    expect(buildQueue({ items, now: NOW, ...limits, unknownCount, limit: 10 })).toHaveLength(1)
  })

  test('the coldest day leads, so a second session is not the first one again', () => {
    const items = [
      settled('今天', { interval: 7, due: NOW + 7 * DAY_MS }),
      settled('上周', { interval: 7, due: NOW + DAY_MS }),
      settled('上月', { interval: 30, due: NOW + DAY_MS }),
    ]
    const queue = buildQueue({ items, now: NOW, ...limits, unknownCount, limit: 10 })
    expect(queue.map((i) => i.text)).toEqual(['上月', '上周', '今天'])
  })

  test('frequency decides between cards that are equally cold', () => {
    RANKS.set('常见', 10)
    RANKS.set('少见', 9000)
    const items = [settled('少见'), settled('常见')]
    const queue = buildQueue({ items, now: NOW, ...limits, unknownCount, limit: 10 })
    expect(queue.map((i) => i.text)).toEqual(['常见', '少见'])
  })

  test('an unranked word sorts behind a ranked one, as everywhere else', () => {
    RANKS.set('有名', 500)
    const items = [settled('无名'), settled('有名')]
    const queue = buildQueue({ items, now: NOW, ...limits, unknownCount, limit: 10 })
    expect(queue.map((i) => i.text)).toEqual(['有名', '无名'])
  })

  test('a day apart beats any rank, so the tail of the deck is reachable', () => {
    RANKS.set('常见', 1)
    const items = [
      settled('常见', { due: NOW + 7 * DAY_MS, interval: 7 }),
      settled('冷门', { due: NOW + 7 * DAY_MS, interval: 8 }),
    ]
    const queue = buildQueue({ items, now: NOW, ...limits, unknownCount, limit: 10 })
    expect(queue.map((i) => i.text)).toEqual(['冷门', '常见'])
  })

  test('the filter narrows what can be practised too', () => {
    const items = [settled('练习'), sentence('句子', { state: 'review', interval: 7, introducedAt: 0, due: NOW + 7 * DAY_MS })]
    const queue = buildQueue({ items, now: NOW, ...limits, unknownCount, include: 'words', limit: 10 })
    expect(queue.map((i) => i.text)).toEqual(['练习'])
  })

  test('the ids of the drilled cards come back with them', () => {
    const items = [word('复习', { state: 'review', due: NOW - DAY_MS }), settled('练习')]
    const session = buildSession({ items, now: NOW, ...limits, unknownCount, limit: 5 })
    expect([...session.extra]).toEqual(['w:练习'])
  })

  test('counts report the whole eligible set, not what the cap allows', () => {
    const items = Array.from({ length: 40 }, (_, i) => settled(`旧${i}`))
    const counts = queueCounts({ items, now: NOW, ...limits, unknownCount, limit: 5 })
    expect(counts.practice).toBe(40)
  })
})
