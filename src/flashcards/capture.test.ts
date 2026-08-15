import { describe, expect, test } from 'vitest'
import {
  coverageOf,
  fraction,
  graduationOrder,
  hanWords,
  isCapturableText,
  selectionTarget,
  shouldCaptureLine,
  unknownIn,
} from './capture'
import type { Token } from '../lang/segment'

const token = (text: string, pinyin: string | null = null): Token => ({ text, pinyin })

describe('hanWords', () => {
  test('keeps only the Chinese tokens', () => {
    const tokens = [token('我'), token('喜欢'), token('，'), token('OK'), token('学习')]
    expect(hanWords(tokens)).toEqual(['我', '喜欢', '学习'])
  })

  test('drops punctuation, spaces and empty tokens', () => {
    expect(hanWords([token('。'), token(' '), token(''), token('!')])).toEqual([])
  })
})

describe('shouldCaptureLine', () => {
  test('keeps a line holding something unknown', () => {
    expect(shouldCaptureLine(['我', '喜欢', '学习'], new Set(['我', '喜欢']))).toBe(true)
  })

  test('skips a line you can already read', () => {
    expect(shouldCaptureLine(['我', '喜欢'], new Set(['我', '喜欢']))).toBe(false)
  })

  test('skips a line with no words at all', () => {
    // A cue of pure punctuation or a musical-note placeholder.
    expect(shouldCaptureLine([], new Set())).toBe(false)
  })

  test('keeps everything while the known set is empty', () => {
    // The beginner case, and the reason capture is generous: a learner cannot
    // pause every four seconds to curate, so the pool absorbs the volume.
    expect(shouldCaptureLine(['我'], new Set())).toBe(true)
  })
})

describe('isCapturableText', () => {
  test('rejects text with no Chinese in it', () => {
    expect(isCapturableText('hello world')).toBe(false)
    expect(isCapturableText('   ')).toBe(false)
  })

  test('rejects a run longer than a sentence', () => {
    expect(isCapturableText('学'.repeat(221))).toBe(false)
    expect(isCapturableText('学'.repeat(220))).toBe(true)
  })
})

describe('selectionTarget', () => {
  const words = new Map([
    ['选择', 'xuan3 ze2'],
    ['我', 'wo3'],
    ['学习', 'xue2 xi2'],
  ])

  test('a single dictionary headword is a word', () => {
    expect(selectionTarget('选择', words)).toEqual({ kind: 'word', text: '选择' })
  })

  test('anything the dictionary does not hold is a sentence', () => {
    // The awkward middle: two words in a row is not a headword, so it is a
    // sentence rather than being forced into the word deck by length alone.
    expect(selectionTarget('我学习', words)).toEqual({ kind: 'sentence', text: '我学习' })
  })

  test('trims before deciding, so a sloppy drag still reads as one word', () => {
    expect(selectionTarget('  学习 \n', words)).toEqual({ kind: 'word', text: '学习' })
  })

  test('rejects a selection with nothing to look up', () => {
    expect(selectionTarget('hello', words)).toBeNull()
    expect(selectionTarget('', words)).toBeNull()
  })
})

describe('coverageOf', () => {
  const counts = [
    { headword: '的', count: 40 },
    { headword: '我', count: 20 },
    { headword: '忧郁', count: 1 },
    { headword: '憔悴', count: 1 },
  ]

  test('reports distinct words and running words separately', () => {
    const coverage = coverageOf(counts, new Set(['的', '我']))
    expect(coverage).toEqual({
      knownTypes: 2,
      totalTypes: 4,
      knownTokens: 60,
      totalTokens: 62,
    })
  })

  test('token coverage runs far ahead of type coverage', () => {
    // This gap is the whole reason both are computed. Knowing half the distinct
    // words here means following 97% of what is actually said, because the
    // words you know are the ones that repeat. Quoting the 50% against the
    // ~90% comprehension threshold would call a followable video hopeless.
    const coverage = coverageOf(counts, new Set(['的', '我']))
    expect(fraction(coverage.knownTypes, coverage.totalTypes)).toBe(0.5)
    expect(fraction(coverage.knownTokens, coverage.totalTokens)).toBeCloseTo(0.968, 3)
  })

  test('survives a video with nothing counted yet', () => {
    const coverage = coverageOf([], new Set())
    expect(fraction(coverage.knownTokens, coverage.totalTokens)).toBe(0)
  })
})

describe('graduationOrder', () => {
  test('introduces the most comprehensible line first', () => {
    const pool = [
      { id: 'hard', unknownCount: 6 },
      { id: 'easy', unknownCount: 1 },
      { id: 'medium', unknownCount: 3 },
    ]
    expect(graduationOrder(pool).map((c) => c.id)).toEqual(['easy', 'medium', 'hard'])
  })

  test('breaks ties on frequency, so the more useful vocabulary comes first', () => {
    const pool = [
      { id: 'rare', unknownCount: 1, rank: 9000 },
      { id: 'common', unknownCount: 1, rank: 120 },
    ]
    expect(graduationOrder(pool).map((c) => c.id)).toEqual(['common', 'rare'])
  })

  test('sorts unranked candidates last', () => {
    // No rank means the word is outside the frequency list entirely, which is
    // evidence of rarity. Treating it as rank 0 would promote exactly the
    // obscure vocabulary the ordering exists to defer.
    const pool = [
      { id: 'unranked', unknownCount: 1 },
      { id: 'ranked', unknownCount: 1, rank: 5000 },
    ]
    expect(graduationOrder(pool).map((c) => c.id)).toEqual(['ranked', 'unranked'])
  })

  test('does not mutate the pool it was given', () => {
    const pool = [{ unknownCount: 5 }, { unknownCount: 1 }]
    graduationOrder(pool)
    expect(pool.map((c) => c.unknownCount)).toEqual([5, 1])
  })
})

describe('unknownIn', () => {
  test('keeps duplicates, since a line can repeat an unknown word', () => {
    expect(unknownIn(['学', '学', '我'], new Set(['我']))).toEqual(['学', '学'])
  })
})
