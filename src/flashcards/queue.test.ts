import { beforeEach, describe, expect, test } from 'vitest'
import { buildQueue, buildSession, queueCounts, type QueueSession } from './queue'
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

const limits = { newSentencesPerDay: 5, rankOf }

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

  test('offers every word collected, however many there are', () => {
    // Words used to be rationed to ten a day. That left a deck of dozens unable
    // to fill a twenty-card session, which reads as the app being broken.
    const items = Array.from({ length: 30 }, (_, i) => {
      RANKS.set(`词${i}`, i)
      return word(`词${i}`)
    })
    expect(buildQueue({ items, now: NOW, ...limits, unknownCount })).toHaveLength(30)
  })

  test('words met earlier today do not hold the rest back', () => {
    const items = [
      ...Array.from({ length: 8 }, (_, i) =>
        word(`旧${i}`, { introducedAt: startOfDay(NOW) + 3600_000, state: 'review', due: NOW + DAY_MS }),
      ),
      ...Array.from({ length: 10 }, (_, i) => word(`新${i}`)),
    ]
    expect(buildQueue({ items, now: NOW, ...limits, unknownCount })).toHaveLength(10)
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

  test('a word already introduced does not block the ones behind it', () => {
    const items = [
      word('已见', { introducedAt: NOW - 1000, state: 'review', due: NOW + DAY_MS }),
      word('待见'),
    ]
    expect(
      buildQueue({ items, now: NOW, newSentencesPerDay: 0, unknownCount, rankOf }).map((i) => i.text),
    ).toEqual(['待见'])
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

describe('new words', () => {
  const SEEN = new Map<string, number>()
  const seenCount = (headword: string) => SEEN.get(headword) ?? 0
  beforeEach(() => SEEN.clear())

  test('frequency leads once a word list has been uploaded', () => {
    // Effort proportional to payoff: the deck grows by whatever crossed your
    // screen, but how often a word is used is how much it is worth knowing.
    RANKS.set('因为', 300).set('憔悴', 22000)
    SEEN.set('憔悴', 500).set('因为', 2)
    const items = [word('憔悴'), word('因为')]
    expect(
      buildQueue({ items, now: NOW, ...limits, unknownCount, seenCount }).map((i) => i.text),
    ).toEqual(['因为', '憔悴'])
  })

  test('exposure breaks a tie between two words of equal rank', () => {
    RANKS.set('甲', 100).set('乙', 100)
    SEEN.set('乙', 90).set('甲', 1)
    const items = [word('甲'), word('乙')]
    expect(
      buildQueue({ items, now: NOW, ...limits, unknownCount, seenCount }).map((i) => i.text),
    ).toEqual(['乙', '甲'])
  })

  test('exposure orders everything when no word list is uploaded', () => {
    // The tie-break quietly becomes the whole ordering, which is the point: a
    // list is uploaded whenever the user gets round to it, and until then every
    // word ties on rank. Exposure is collected from the first video watched.
    SEEN.set('那', 90).set('憔悴', 1)
    const items = [word('憔悴', { createdAt: 1 }), word('那', { createdAt: 2 })]
    expect(RANKS.size).toBe(0)
    expect(
      buildQueue({ items, now: NOW, ...limits, unknownCount, seenCount }).map((i) => i.text),
    ).toEqual(['那', '憔悴'])
  })

  test('the session size is the only thing that limits how many are met', () => {
    const items = Array.from({ length: 40 }, (_, i) => word(`词${i}`))
    expect(
      buildQueue({ items, now: NOW, ...limits, unknownCount, seenCount, limit: 20 }),
    ).toHaveLength(20)
  })

  test('a word already introduced is not offered again', () => {
    const items = [word('憔悴', { introducedAt: NOW - DAY_MS })]
    expect(buildQueue({ items, now: NOW, ...limits, unknownCount, seenCount })).toEqual([])
  })

  test('a word declared known is never offered, even unstudied', () => {
    // Declaring a word known is not something intake gets to overrule, and such
    // a word has no `introducedAt` to exclude it.
    const items = [word('我', { state: 'known' })]
    expect(buildQueue({ items, now: NOW, ...limits, unknownCount, seenCount })).toEqual([])
  })

  test('due cards still come before anything new', () => {
    SEEN.set('那', 500)
    const items = [word('那'), word('复习', { state: 'review', due: NOW - DAY_MS })]
    expect(
      buildQueue({ items, now: NOW, ...limits, unknownCount, seenCount }).map((i) => i.text),
    ).toEqual(['复习', '那'])
  })

  test('new lines are not starved by a deck full of new words', () => {
    // Lines are still rationed to a handful a day while words are not, so the
    // other order would push every line past the session limit and stop
    // sentence intake altogether.
    const items = [
      ...Array.from({ length: 200 }, (_, i) => word(`词${i}`)),
      sentence('易1'),
      sentence('中3'),
    ]
    const queue = buildQueue({ items, now: NOW, ...limits, unknownCount, seenCount, limit: 10 })
    expect(queue.filter((i) => i.kind === 'sentence').map((i) => i.text)).toEqual(['易1', '中3'])
    expect(queue).toHaveLength(10)
  })

  test('an absent seenCount still builds a queue', () => {
    const items = [word('甲'), word('乙', { state: 'review', due: NOW - DAY_MS })]
    expect(buildQueue({ items, now: NOW, ...limits, unknownCount }).map((i) => i.text)).toEqual([
      '乙',
      '甲',
    ])
  })

  test('every uncollected word counts towards what the start screen promises', () => {
    const items = [word('甲'), word('乙')]
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
      newGrammar: 0,
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
    expect(counts).toEqual({
      due: 1,
      newWords: 1,
      newSentences: 0,
      newGrammar: 0,
      pooled: 0,
      practice: 0,
    })
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

  test('leaves the line pool alone, so the daily budget stays the only door', () => {
    // Topping a session up from the sentence pool would let drilling introduce
    // material: `applyReviewIn` sets introducedAt on first review, so failing a
    // drilled pooled line would quietly spend a slot of today's intake.
    const items = [
      ...Array.from({ length: 30 }, (_, i) => word(`余${i}`)),
      ...Array.from({ length: 30 }, (_, i) => sentence(`余句${i}`)),
    ]
    const queue = buildQueue({ items, now: NOW, ...limits, unknownCount, limit: 40 })
    // Thirty words, which are unrationed, plus the five lines the day allows.
    expect(queue).toHaveLength(30 + limits.newSentencesPerDay)
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

describe('grammar intake', () => {
  const pattern = (id: string, over: Partial<Item> = {}): Item =>
    make({ id: `g:${id}`, kind: 'grammar', patternId: id, text: 'V + 得 + how', state: 'pool', ...over })

  const ids = (session: QueueSession) => session.cards.map((c) => c.id)

  test('releases pooled patterns into the session', () => {
    const session = buildSession({
      items: [pattern('de-complement')],
      now: NOW,
      newSentencesPerDay: 5,
      unknownCount: () => 0,
      rankOf: () => undefined,
      limit: 10,
    })

    expect(ids(session)).toContain('g:de-complement')
  })

  // A pattern is worth studying in proportion to how often you have actually
  // met it, the same reasoning that orders the word pool by sightings.
  test('takes the most-met pattern first', () => {
    const met = (n: number) =>
      Array.from({ length: n }, () => ({ text: 'x', translation: '', at: 0 }))

    const session = buildSession({
      items: [
        pattern('shi-de', { contexts: met(1) }),
        pattern('de-complement', { contexts: met(9) }),
        pattern('ba-construction', { contexts: met(4) }),
      ],
      now: NOW,
      newSentencesPerDay: 5,
      unknownCount: () => 0,
      rankOf: () => undefined,
      limit: 10,
    })

    expect(ids(session)).toEqual(['g:de-complement', 'g:ba-construction', 'g:shi-de'])
  })

  test('is budgeted like lines, not released all at once like words', () => {
    const patterns = Array.from({ length: 8 }, (_, i) => pattern(`p${i}`))
    const session = buildSession({
      items: patterns,
      now: NOW,
      newSentencesPerDay: 2,
      unknownCount: () => 0,
      rankOf: () => undefined,
      limit: 20,
    })

    expect(session.cards).toHaveLength(2)
  })

  test('studying only words leaves patterns out', () => {
    const session = buildSession({
      items: [pattern('de-complement')],
      now: NOW,
      newSentencesPerDay: 5,
      unknownCount: () => 0,
      rankOf: () => undefined,
      include: 'words',
      limit: 10,
    })

    expect(session.cards).toHaveLength(0)
  })

  test('studying only grammar leaves words and lines out', () => {
    const session = buildSession({
      items: [pattern('de-complement'), word('学习'), sentence('我很累。')],
      now: NOW,
      newSentencesPerDay: 5,
      unknownCount: () => 0,
      rankOf: () => undefined,
      include: 'grammar',
      limit: 10,
    })

    expect(ids(session)).toEqual(['g:de-complement'])
  })
})
