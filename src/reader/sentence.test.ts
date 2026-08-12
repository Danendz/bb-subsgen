import { describe, expect, test } from 'vitest'
import { sentenceAt, sentenceTextAt } from './sentence'

describe('sentenceAt', () => {
  const text = '他在北京大学学习。中文很有趣！我喜欢。'

  test('bounds the sentence containing the index', () => {
    expect(sentenceAt(text, 3)).toEqual({ start: 0, end: 9 })
  })

  test('includes the terminator that ends the sentence', () => {
    expect(text.slice(...Object.values(sentenceAt(text, 3)) as [number, number])).toBe(
      '他在北京大学学习。',
    )
  })

  test('finds a middle sentence between two terminators', () => {
    expect(sentenceTextAt(text, 10)).toBe('中文很有趣！')
  })

  test('finds the last sentence with nothing after it', () => {
    expect(sentenceTextAt(text, 16)).toBe('我喜欢。')
  })

  test('treats the terminator itself as belonging to its own sentence', () => {
    // Index 8 is 。— the end of the first sentence, not the start of the second.
    expect(sentenceTextAt(text, 8)).toBe('他在北京大学学习。')
  })

  test('handles text with no punctuation at all', () => {
    expect(sentenceTextAt('学习中文', 2)).toBe('学习中文')
  })

  test('splits on newlines, so a heading never absorbs the paragraph after it', () => {
    expect(sentenceTextAt('标题\n正文内容', 4)).toBe('正文内容')
  })

  test('trims surrounding whitespace', () => {
    expect(sentenceTextAt('  学习中文  ', 4)).toBe('学习中文')
  })

  test('returns an empty span for empty text', () => {
    expect(sentenceAt('', 0)).toEqual({ start: 0, end: 0 })
  })

  test('clamps an index past the end rather than running off', () => {
    expect(sentenceTextAt('学习中文', 99)).toBe('学习中文')
  })

  test('caps a runaway sentence so one hover never translates a whole article', () => {
    const long = '中'.repeat(600)
    expect(sentenceTextAt(long, 300).length).toBeLessThanOrEqual(220)
  })
})
