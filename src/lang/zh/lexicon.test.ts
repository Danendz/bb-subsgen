import { describe, expect, test } from 'vitest'
import { loadChinese, parseWords } from './lexicon'
import { chinesePack } from './pack'

describe('parseWords', () => {
  test('parses tab-separated headword/pinyin lines into a Map', () => {
    const { words } = parseWords('我\two3\n喜欢\txi3 huan5')
    expect(words.get('我')).toBe('wo3')
    expect(words.get('喜欢')).toBe('xi3 huan5')
    expect(words.size).toBe(2)
  })

  test('ignores blank lines', () => {
    const { words } = parseWords('我\two3\n\n喜欢\txi3 huan5\n')
    expect(words.size).toBe(2)
  })

  // Phrasebook entries keep their reading — the dictionary screen still finds
  // them, and a lookup still shows them — they are only barred from claiming a
  // span of characters during segmentation.
  test('reads the phrase flag while keeping the headword in the reading table', () => {
    const { words, phrases } = parseWords('过得\tguo4 de2\tp\n觉得\tjue2 de5')

    expect(words.get('过得')).toBe('guo4 de2')
    expect(phrases.has('过得')).toBe(true)
    expect(phrases.has('觉得')).toBe(false)
  })

  test('treats a file written before the flag column existed as all words', () => {
    const { words, phrases } = parseWords('我\two3\n喜欢\txi3 huan5')

    expect(words.size).toBe(2)
    expect(phrases.size).toBe(0)
  })
})

describe('loadChinese', () => {
  const lexicon = loadChinese('学习\txue2 xi2\n我\two3', chinesePack)

  test('carries the pack it was loaded from, so a holder need not carry both', () => {
    expect(lexicon.pack).toBe(chinesePack)
  })

  test('answers whether a selection is exactly one headword', () => {
    // What separates a word from a sentence in the reader — see selectionTarget.
    expect(lexicon.has('学习')).toBe(true)
    expect(lexicon.has('我学习')).toBe(false)
  })

  test('an empty download is a working lexicon that finds nothing', () => {
    // A screen open before the dictionary is installed, which must render.
    const empty = loadChinese('', chinesePack)
    expect(empty.has('我')).toBe(false)
    expect(empty.search('学', new Set(), 5)).toEqual([])
    expect(empty.segment('我学习').map((t) => t.text)).toEqual(['我', '学', '习'])
  })
})
