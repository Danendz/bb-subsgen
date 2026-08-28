import { describe, expect, test } from 'vitest'
import { isKana, needsFurigana, toHiragana } from './script'

describe('isKana', () => {
  test('counts ー as kana, because it is said and never annotated', () => {
    // Script=Common, so a property test alone would miss it and ラーメン would
    // be asked for a reading of its long vowel.
    expect(isKana('ー')).toBe(true)
    expect(['あ', 'ア', 'っ'].every(isKana)).toBe(true)
    expect(isKana('食')).toBe(false)
  })
})

describe('needsFurigana', () => {
  test('annotates the marks that take a reading of their own', () => {
    // 時々 reads ときどき and 一ヶ月 reads いっかげつ: both marks are where a
    // reading is said, not a literal the reading has to contain.
    expect(['々', '〆', 'ヶ'].every(needsFurigana)).toBe(true)
  })

  test('leaves alone what is already read as written', () => {
    expect(['ば', 'ル', 'ー', '、', 'A'].some(needsFurigana)).toBe(false)
    expect(needsFurigana('日')).toBe(true)
  })
})

describe('toHiragana', () => {
  test('folds katakana only, so a matcher can pair the two ways of writing a sound', () => {
    expect(toHiragana('ケシゴム')).toBe('けしごむ')
    // ー has no hiragana counterpart to fold to, and neither does 消.
    expect(toHiragana('消しラーメン')).toBe('消しらーめん')
  })
})
