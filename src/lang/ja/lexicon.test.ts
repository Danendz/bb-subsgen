import { describe, expect, test } from 'vitest'
import { loadJapanese } from './lexicon'
import { japanesePack } from './pack'

// Real lines in the format the install writes: headword, reading, and flags —
// `r` for a spelling segmentation must not take, plus the word class #15 needs.
const LEXICON = [
  '猫\tねこ',
  'ねこ\tねこ',
  '食べる\tたべる\tv1',
  'たべる\tたべる\tv1',
  'ください\tください',
  '茲\tここ\tr',
  'ここ\tここ',
  'ラーメン\tラーメン',
].join('\n')

const lexicon = loadJapanese(LEXICON, japanesePack)

describe('loadJapanese', () => {
  test('a kana-only word is a headword like any other, not a gap between them', () => {
    // 41,195 of JMdict's entries have no kanji at all. A lexicon that indexed
    // only spellings would lose every one of them.
    expect(lexicon.has('ください')).toBe(true)
  })

  test('finds a rare spelling, which is the whole difference from segmenting it', () => {
    expect(lexicon.has('茲')).toBe(true)
    expect(lexicon.matchAt('茲にて', 0)?.text).toBe('茲')
  })

  test('an empty install is a working lexicon that finds nothing', () => {
    const empty = loadJapanese('', japanesePack)
    expect(empty.has('猫')).toBe(false)
    expect(empty.segment('猫が好き')).toEqual([{ text: '猫が好き', reading: null, kind: 'other' }])
  })

  test('reads a word backwards from the character hovered, not forwards from it', () => {
    // Japanese has no spaces either, so the character under the cursor is
    // rarely a word's first.
    expect(lexicon.matchAt('私は食べる', 3)).toEqual({
      text: '食べる',
      reading: [
        { base: '食', text: 'た', tone: null },
        { base: 'べる', text: '', tone: null },
      ],
      start: 2,
      end: 5,
    })
  })

  test('falls back to the character itself, so a missed word still gets a card', () => {
    // No reading to align, so the part says the alignment is not known rather
    // than claiming 私 reads as nothing — the shape `furiganaParts` documents.
    expect(lexicon.matchAt('私は', 0)).toEqual({
      text: '私',
      reading: [{ base: '', text: '', tone: null }],
      start: 0,
      end: 1,
    })
  })

  test('leaves the Latin and the punctuation alone', () => {
    expect(lexicon.matchAt('OK猫', 0)).toBeNull()
  })
})

describe('search', () => {
  test('a katakana query finds a hiragana headword, and the reverse', () => {
    expect(lexicon.search('ネコ', new Set(), 10)).toContain('ねこ')
    expect(lexicon.search('らーめん', new Set(), 10)).toContain('ラーメン')
  })

  test('prefix matches lead, because that is what the keystroke meant', () => {
    expect(lexicon.search('た', new Set(), 10)).toEqual(['たべる'])
  })

  test('a query with nothing Japanese in it never walks the index', () => {
    expect(lexicon.search('cat', new Set(), 10)).toEqual([])
  })

  test('what is already in the deck is not offered again', () => {
    expect(lexicon.search('ねこ', new Set(['ねこ']), 10)).toEqual([])
  })
})
