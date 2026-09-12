import { describe, expect, test } from 'vitest'
import { answerOf, buildBank, distractorChars, isCorrect, seedFor, shuffle } from './wordbank'
import type { Token } from '../lang/pack'

const tokens = (...texts: string[]): Token[] =>
  texts.map((text) => ({
    text,
    reading: null,
    kind: /\p{Script=Han}/u.test(text) ? 'content' : 'other',
  }))

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
  const answer = ['我今天很累']

  test('accepts the line in order', () => {
    expect(isCorrect(['我', '今天', '很', '累'], answer)).toBe(true)
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
    expect(isCorrect(['我们', '走'], ['我们走'])).toBe(true)
  })

  test('a kana answer settles a kanji card, for want of an IME', () => {
    // The variant forms are answers in their own right, and the typing escape
    // has to accept every one the word-typing path did.
    expect(isCorrect(['たべる'], ['食べる', 'たべる'])).toBe(true)
  })

  test('nothing placed is not correct', () => {
    expect(isCorrect([], answer)).toBe(false)
  })
})

describe('distractorChars', () => {
  test('a two-character word gets something to place wrongly', () => {
    // Laid out as exactly its own two tiles there is nothing to get wrong, and
    // the card tests arrangement rather than recall.
    expect(distractorChars(['学生', '老师'], 3)).toEqual(['学', '生', '老'])
  })

  test('stops at the count rather than emptying every word it was given', () => {
    expect(distractorChars(['学生', '老师', '朋友', '医生'], 2)).toHaveLength(2)
  })

  test('a character met twice is offered once', () => {
    // Two identical tiles make the check ambiguous, which is the same hazard
    // `buildBank` drops duplicates for.
    expect(distractorChars(['学生', '学校'], 4)).toEqual(['学', '生', '校'])
  })

  test('no near words means no extras, rather than a crash', () => {
    // A first session on a deck of one word. The card is easier than it will be
    // later, which is better than it not being askable.
    expect(distractorChars([], 3)).toEqual([])
  })
})
