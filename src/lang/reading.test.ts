import { describe, expect, test } from 'vitest'
import { readingFromText, readingText, toneColor } from './reading'
import type { ReadingPart } from './pack'

const part = (text: string, tone: number | null = null, base = ''): ReadingPart => ({
  base,
  text,
  tone,
})

describe('readingText', () => {
  test('joins what is drawn, not what a dictionary wrote', () => {
    expect(readingText([part('xǐ', 3, '喜'), part('huan', 5, '欢')])).toBe('xǐ huan')
  })

  // The card's `also read` line runs the syllables together the way a
  // dictionary prints a word, and the DOM round trip needs them separated.
  test('takes the separator, because its two callers genuinely disagree', () => {
    expect(readingText([part('xǐ'), part('huan')], '')).toBe('xǐhuan')
  })

  test('a word with no reading is empty text, not a stray separator', () => {
    expect(readingText([])).toBe('')
  })
})

describe('readingFromText', () => {
  test('admits it knows no base and no tone, rather than guessing at either', () => {
    expect(readingFromText('xǐ huan')).toEqual([
      { base: '', text: 'xǐ', tone: null },
      { base: '', text: 'huan', tone: null },
    ])
  })

  // A word element with no reading carries no attribute, and `?? ''` is what
  // arrives — one empty part would draw an empty ruby and reserve its height.
  test('nothing round-trips to no parts', () => {
    expect(readingFromText('')).toEqual([])
  })
})

describe('toneColor', () => {
  test('maps each tone to its softened palette color', () => {
    expect(toneColor(1)).toBe('#ff8a8a')
    expect(toneColor(2)).toBe('#ffc46b')
    expect(toneColor(3)).toBe('#7ee0a8')
    expect(toneColor(4)).toBe('#8ab6ff')
    expect(toneColor(5)).toBe('#c3c8d0')
  })

  test('falls back to the neutral color for an unknown tone', () => {
    expect(toneColor(9)).toBe('#c3c8d0')
  })
})
