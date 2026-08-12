import { describe, expect, test } from 'vitest'
import { parseWords } from './dict'

describe('parseWords', () => {
  test('parses tab-separated headword/pinyin lines into a Map', () => {
    const words = parseWords('我\two3\n喜欢\txi3 huan5')
    expect(words.get('我')).toBe('wo3')
    expect(words.get('喜欢')).toBe('xi3 huan5')
    expect(words.size).toBe(2)
  })

  test('ignores blank lines', () => {
    const words = parseWords('我\two3\n\n喜欢\txi3 huan5\n')
    expect(words.size).toBe(2)
  })
})
