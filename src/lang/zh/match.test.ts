import { describe, expect, test } from 'vitest'
import { matchAt } from './match'

const words = new Map<string, string>([
  ['学', 'xue2'],
  ['习', 'xi2'],
  ['学习', 'xue2 xi2'],
  ['中文', 'zhong1 wen2'],
  ['北京', 'Bei3 jing1'],
  ['大学', 'da4 xue2'],
  ['北京大学', 'Bei3 jing1 Da4 xue2'],
])

describe('matchAt', () => {
  test('matches the word starting at the hovered character', () => {
    expect(matchAt('学习中文', 0, words)).toEqual({
      text: '学习',
      pinyin: 'xue2 xi2',
      start: 0,
      end: 2,
    })
  })

  test('matches a word the caret landed in the middle of', () => {
    // Chinese has no spaces, so the character you point at is rarely the
    // word's first — forward-only matching would return 习 here.
    expect(matchAt('学习中文', 1, words)).toEqual({
      text: '学习',
      pinyin: 'xue2 xi2',
      start: 0,
      end: 2,
    })
  })

  test('prefers the longest word covering the character', () => {
    // 京 is inside 北京, 北京大学 — the longest wins.
    expect(matchAt('北京大学', 1, words)).toEqual({
      text: '北京大学',
      pinyin: 'Bei3 jing1 Da4 xue2',
      start: 0,
      end: 4,
    })
  })

  test('falls back to the single character when no word matches', () => {
    expect(matchAt('学', 0, words)).toEqual({
      text: '学',
      pinyin: 'xue2',
      start: 0,
      end: 1,
    })
  })

  test('returns the character with empty pinyin when the dictionary misses it', () => {
    // A card with no reading still beats no card at all.
    expect(matchAt('鿕', 0, words)).toEqual({ text: '鿕', pinyin: '', start: 0, end: 1 })
  })

  test('ignores non-Han characters', () => {
    expect(matchAt('hello 学习', 0, words)).toBeNull()
    expect(matchAt('学习。', 2, words)).toBeNull()
  })

  test('returns null past the end of the text', () => {
    expect(matchAt('学习', 5, words)).toBeNull()
  })

  test('does not run past the end of the text when matching', () => {
    // 大学 sits at the very end; the scan must not read beyond it.
    expect(matchAt('去大学', 2, words)).toEqual({
      text: '大学',
      pinyin: 'da4 xue2',
      start: 1,
      end: 3,
    })
  })
})
