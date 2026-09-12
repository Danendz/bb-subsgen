import { describe, expect, test } from 'vitest'
import { chooseTarget, fallbackTarget } from './cloze'

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

describe('fallbackTarget', () => {
  const ranks: Record<string, number> = { 我: 8, 在: 40, 学习: 620, 中文: 1100 }
  const rankOf = (word: string) => ranks[word]

  test('blanks the rarest word, because that is the one worth testing', () => {
    expect(fallbackTarget(['我', '在', '学习', '中文'], rankOf)).toBe('中文')
  })

  test('with no word list installed, blanks the longest word instead of 的', () => {
    // Every rank is absent until a frequency list is downloaded, and the
    // question then has to be settled on the only evidence left in the line.
    expect(fallbackTarget(['我', '的', '时候'], () => undefined)).toBe('时候')
  })

  test('a partly ranked line ignores the words the list has never heard of', () => {
    // A name or a slang coinage is missing from the list rather than rare, and
    // treating absence as rarity would blank it every time.
    expect(fallbackTarget(['我', '在', '小红'], rankOf)).toBe('在')
  })

  test('has nothing to offer a line with no vocabulary in it', () => {
    expect(fallbackTarget([], rankOf)).toBeNull()
  })
})
