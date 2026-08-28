import { describe, expect, test } from 'vitest'
import { sentenceAt, sentenceTextAt } from './sentence'
import { TERMINATORS as ZH } from './zh/sentence'
import { TERMINATORS as JA } from './ja/sentence'

describe('sentenceAt', () => {
  const text = '他在北京大学学习。中文很有趣！我喜欢。'

  test('bounds the sentence containing the index', () => {
    expect(sentenceAt(text, 3, ZH)).toEqual({ start: 0, end: 9 })
  })

  test('includes the terminator that ends the sentence', () => {
    const { start, end } = sentenceAt(text, 3, ZH)
    expect(text.slice(start, end)).toBe('他在北京大学学习。')
  })

  test('finds a middle sentence between two terminators', () => {
    expect(sentenceTextAt(text, 10, ZH)).toBe('中文很有趣！')
  })

  test('finds the last sentence with nothing after it', () => {
    expect(sentenceTextAt(text, 16, ZH)).toBe('我喜欢。')
  })

  test('treats the terminator itself as belonging to its own sentence', () => {
    // Index 8 is 。— the end of the first sentence, not the start of the second.
    expect(sentenceTextAt(text, 8, ZH)).toBe('他在北京大学学习。')
  })

  test('handles text with no punctuation at all', () => {
    expect(sentenceTextAt('学习中文', 2, ZH)).toBe('学习中文')
  })

  test('splits on newlines, so a heading never absorbs the paragraph after it', () => {
    expect(sentenceTextAt('标题\n正文内容', 4, ZH)).toBe('正文内容')
  })

  test('trims surrounding whitespace', () => {
    expect(sentenceTextAt('  学习中文  ', 4, ZH)).toBe('学习中文')
  })

  test('returns an empty span for empty text', () => {
    expect(sentenceAt('', 0, ZH)).toEqual({ start: 0, end: 0 })
  })

  test('clamps an index past the end rather than running off', () => {
    expect(sentenceTextAt('学习中文', 99, ZH)).toBe('学习中文')
  })

  test('caps a runaway sentence so one hover never translates a whole article', () => {
    const long = '中'.repeat(600)
    expect(sentenceTextAt(long, 300, ZH).length).toBeLessThanOrEqual(220)
  })

  test('reads the table it is handed, not a Chinese one', () => {
    // The 、 between the clauses is a comma in both languages, and the scan must
    // run straight past it to the 。 that actually ends the line.
    expect(sentenceTextAt('朝ご飯を食べて、学校へ行った。それから寝た。', 3, JA)).toBe(
      '朝ご飯を食べて、学校へ行った。',
    )
  })
})
