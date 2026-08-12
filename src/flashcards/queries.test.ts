import { describe, expect, test } from 'vitest'
import { deckCounts, hskProgress, knownSetOf } from './queries'
import { MATURE_INTERVAL_DAYS } from './known'
import type { Item, Rank } from './types'

function item(partial: Partial<Item> & Pick<Item, 'id' | 'kind' | 'text'>): Item {
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
  item({ id: `w:${text}`, kind: 'word', text, ...extra })

const sentence = (text: string, extra: Partial<Item> = {}) =>
  item({ id: `s:${text}`, kind: 'sentence', text, state: 'pool', ...extra })

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
    expect(deckCounts(items)).toEqual({ words: 3, known: 2, sentences: 2, pool: 1 })
  })

  test('an empty deck counts to zero rather than throwing', () => {
    expect(deckCounts([])).toEqual({ words: 0, known: 0, sentences: 0, pool: 0 })
  })
})

describe('hskProgress', () => {
  const ranks: Rank[] = [
    { headword: '我', hsk: 1, rank: 1 },
    { headword: '你', hsk: 1, rank: 2 },
    { headword: '学习', hsk: 2, rank: 412 },
    // No HSK level — carries a frequency rank only, as most words do.
    { headword: '憔悴', rank: 20000 },
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
    expect(hskProgress([{ headword: '我', rank: 1 }], new Set())).toEqual([])
    expect(hskProgress([], new Set())).toEqual([])
  })
})
