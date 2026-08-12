import { describe, expect, test } from 'vitest'
import { chooseTarget, clozeOf } from './cloze'

describe('chooseTarget', () => {
  const words = ['我', '在', '学习', '中文']

  test('the word whose lookup captured the line always wins', () => {
    expect(chooseTarget(words, new Set(), '学习')).toBe('学习')
  })

  test('blanks the single unknown word when there is exactly one', () => {
    // Which is also the case the intake ordering serves first, so most
    // sentences reaching review are clozeable without an explicit target.
    expect(chooseTarget(words, new Set(['我', '在', '中文']))).toBe('学习')
  })

  test('falls back to plain recall when two words are unknown', () => {
    // Blanking one of two unknowns leaves a sentence you still cannot read,
    // so the question would be unanswerable rather than merely hard.
    expect(chooseTarget(words, new Set(['我', '在']))).toBeNull()
  })

  test('falls back when everything is already known', () => {
    expect(chooseTarget(words, new Set(words))).toBeNull()
  })

  test('a word repeated in the line is still one unknown', () => {
    expect(chooseTarget(['好', '好', '我'], new Set(['我']))).toBe('好')
  })

  test('ignores an explicit target that is not in the line', () => {
    // The line can be re-captured from elsewhere, or trimmed since capture.
    expect(chooseTarget(words, new Set(['我', '在', '中文']), '朋友')).toBe('学习')
  })
})

describe('clozeOf', () => {
  test('splits around the target', () => {
    expect(clozeOf('我在学习中文。', '学习')).toEqual({
      before: '我在',
      blank: '学习',
      after: '中文。',
    })
  })

  test('handles a target at either end', () => {
    expect(clozeOf('我很好', '我')).toEqual({ before: '', blank: '我', after: '很好' })
    expect(clozeOf('我很好', '好')).toEqual({ before: '我很', blank: '好', after: '' })
  })

  test('blanks only the first occurrence', () => {
    // Blanking both would remove the repetition that often gives the answer
    // away, but it would also make the sentence read as two different gaps.
    expect(clozeOf('好好学习', '好')).toEqual({ before: '', blank: '好', after: '好学习' })
  })

  test('returns null when the target is not there', () => {
    expect(clozeOf('我很好', '朋友')).toBeNull()
    expect(clozeOf('我很好', '')).toBeNull()
  })
})
