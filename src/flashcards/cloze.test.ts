import { describe, expect, test } from 'vitest'
import { chooseTarget } from './cloze'

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
