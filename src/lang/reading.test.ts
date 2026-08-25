import { describe, expect, test } from 'vitest'
import { readingColumns, readingFromText, readingText, toneColor } from './reading'
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

describe('readingColumns', () => {
  test('cuts one column per part when every part says what it sits over', () => {
    expect(readingColumns('学习', [part('xué', 2, '学'), part('xí', 2, '习')])).toEqual([
      { base: '学', parts: [part('xué', 2, '学')] },
      { base: '习', parts: [part('xí', 2, '习')] },
    ])
  })

  // CC-CEDICT carries headwords where syllables and characters cannot line up:
  // the comma in 不入虎穴，焉得虎子 is written and not said, so `readingParts`
  // sets every base to '' rather than guess which syllable it displaced.
  test('draws a word its producer could not align as one run, the way it did before', () => {
    const parts = [part('bù', 4), part('rù', 4), part('hǔ', 3), part('xué', 2)]
    expect(readingColumns('不入虎穴', parts)).toEqual([{ base: '不入虎穴', parts }])
  })

  // The case #16 exists for: た belongs over 食 alone, and べる is read as written.
  test('leaves a kana run bare so its furigana stays over the kanji', () => {
    expect(readingColumns('食べる', [part('た', null, '食'), part('', null, 'べる')])).toEqual([
      { base: '食', parts: [part('た', null, '食')] },
      { base: 'べる', parts: [] },
    ])
  })

  // 昨日/きのう has no rule saying きの belongs to 昨, so furigana.ts groups per
  // run — one run here, and one column is the honest answer, not a failure.
  test('keeps a run that no rule can subdivide whole', () => {
    expect(readingColumns('昨日', [part('きのう', null, '昨日')])).toEqual([
      { base: '昨日', parts: [part('きのう', null, '昨日')] },
    ])
  })

  test('draws an all-kana surface with an empty row above it, not a missing one', () => {
    expect(readingColumns('たべる', [part('', null, 'たべる')])).toEqual([
      { base: 'たべる', parts: [] },
    ])
  })

  test('a word with no reading is still a column, so the line keeps one baseline', () => {
    expect(readingColumns('ABC', null)).toEqual([{ base: 'ABC', parts: [] }])
  })

  // A producer bug must cost the reading, never the characters: whatever the
  // bases say, the columns still spell the line the viewer is reading.
  test('never drops a character when the bases disagree with the surface', () => {
    const parts = [part('た', null, '食'), part('', null, 'べ')]
    expect(readingColumns('食べる', parts)).toEqual([{ base: '食べる', parts }])
  })
})
