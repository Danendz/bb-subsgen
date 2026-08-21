import { describe, expect, test } from 'vitest'
import { answerOf, buildBank, isCorrect, seedFor, shuffle } from './wordbank'
import type { Token } from '../lang/segment'

const tokens = (...texts: string[]): Token[] => texts.map((text) => ({ text, pinyin: null }))

describe('answerOf', () => {
  test('punctuation is scenery, not a tile', () => {
    // Tapping 。into place teaches nothing and lengthens every answer.
    expect(answerOf(tokens('我', '今天', '很', '累', '。'))).toEqual(['我', '今天', '很', '累'])
  })
})

describe('shuffle', () => {
  test('keeps every tile', () => {
    const items = ['我', '今天', '很', '累']
    expect([...shuffle(items, 7)].sort()).toEqual([...items].sort())
  })

  test('the same seed gives the same arrangement', () => {
    // Tiles rearranging under the user's fingers mid-answer reads as a bug.
    expect(shuffle(['a', 'b', 'c', 'd', 'e'], 42)).toEqual(shuffle(['a', 'b', 'c', 'd', 'e'], 42))
  })

  test('different seeds generally differ', () => {
    const arrangements = new Set(
      [1, 2, 3, 4, 5].map((s) => shuffle(['a', 'b', 'c', 'd'], s).join()),
    )
    expect(arrangements.size).toBeGreaterThan(1)
  })

  test('does not mutate its input', () => {
    const items = ['a', 'b', 'c']
    shuffle(items, 3)
    expect(items).toEqual(['a', 'b', 'c'])
  })
})

describe('seedFor', () => {
  test('a card reshuffles between sittings', () => {
    expect(seedFor('s:我很累。', 0)).not.toBe(seedFor('s:我很累。', 1))
  })

  test('but not within one', () => {
    expect(seedFor('s:我很累。', 3)).toBe(seedFor('s:我很累。', 3))
  })
})

describe('buildBank', () => {
  test('offers the answer plus the distractors', () => {
    const bank = buildBank(['我', '很', '累'], ['他', '不'], 1)
    expect([...bank.tiles].sort()).toEqual(['不', '他', '很', '我', '累'].sort())
  })

  test('drops a distractor that is already in the answer', () => {
    // Two identical tiles make the check ambiguous and one of them impossible
    // to place wrongly.
    const bank = buildBank(['我', '很', '累'], ['我', '他'], 1)
    expect(bank.tiles).toHaveLength(4)
    expect(bank.tiles.filter((t) => t === '我')).toHaveLength(1)
  })

  test('deduplicates the distractors themselves', () => {
    expect(buildBank(['我'], ['他', '他', '不'], 1).tiles).toHaveLength(3)
  })

  test('the answer order is preserved even though the tiles are shuffled', () => {
    expect(buildBank(['我', '今天', '很', '累'], [], 9).answer).toEqual(['我', '今天', '很', '累'])
  })
})

describe('isCorrect', () => {
  const answer = ['我', '今天', '很', '累']

  test('accepts the line in order', () => {
    expect(isCorrect(answer, answer)).toBe(true)
  })

  test('rejects the wrong order', () => {
    expect(isCorrect(['今天', '我', '很', '累'], answer)).toBe(false)
  })

  test('rejects an unfinished line', () => {
    expect(isCorrect(['我', '今天'], answer)).toBe(false)
  })

  test('accepts a different segmentation of the same sentence', () => {
    // The user is being asked for the sentence, not for the segmenter's opinion
    // of where its word boundaries fall.
    expect(isCorrect(['我们', '走'], ['我', '们', '走'])).toBe(true)
  })

  test('nothing placed is not correct', () => {
    expect(isCorrect([], answer)).toBe(false)
  })
})
