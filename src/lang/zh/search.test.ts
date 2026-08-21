import { describe, expect, test } from 'vitest'
import { searchHeadwords } from './search'
import { chinesePack } from './pack'

/** A slice of CC-CEDICT, shaped exactly as `words.bin` parses into. */
const WORDS = new Map<string, string>([
  ['学', 'xue2'],
  ['学习', 'xue2 xi2'],
  ['学生', 'xue2 sheng1'],
  ['学校', 'xue2 xiao4'],
  ['学以致用', 'xue2 yi3 zhi4 yong4'],
  ['大学', 'da4 xue2'],
  ['同学', 'tong2 xue2'],
  ['我', 'wo3'],
])

const nothing = new Set<string>()

describe('searchHeadwords', () => {
  test('puts words starting with the query before words merely containing it', () => {
    // Typing 学 almost always means "a word beginning 学", not "any word with a
    // 学 in it" — 大学 is a worse answer to that keystroke than 学习 is.
    const found = searchHeadwords(WORDS, '学', nothing, 20)
    expect(found.indexOf('学习')).toBeLessThan(found.indexOf('大学'))
    expect(found.indexOf('学生')).toBeLessThan(found.indexOf('同学'))
  })

  test('offers the shortest match first within a group', () => {
    // Shorter words are commoner, and the exact word typed should never be
    // buried under the four-character idiom that contains it.
    expect(searchHeadwords(WORDS, '学', nothing, 20)[0]).toBe('学')
    const found = searchHeadwords(WORDS, '学', nothing, 20)
    expect(found.indexOf('学习')).toBeLessThan(found.indexOf('学以致用'))
  })

  test('leaves out words already in the deck', () => {
    // They are rendered in the section above. A word in both lists would offer
    // an Add button for something already added.
    const found = searchHeadwords(WORDS, '学', new Set(['学', '学习']), 20)
    expect(found).not.toContain('学')
    expect(found).not.toContain('学习')
    expect(found).toContain('学生')
  })

  test('caps the results, so one common character cannot render thousands of rows', () => {
    expect(searchHeadwords(WORDS, '学', nothing, 3)).toHaveLength(3)
  })

  test('finds a multi-character query', () => {
    expect(searchHeadwords(WORDS, '学习', nothing, 20)).toEqual(['学习'])
  })

  test('ignores surrounding whitespace, which pasting brings with it', () => {
    expect(searchHeadwords(WORDS, '  学习 ', nothing, 20)).toEqual(['学习'])
  })

  test('returns nothing for a query with no Chinese in it', () => {
    // There is no English index. Returning every word whose pinyin happened to
    // contain the letters would be a worse answer than none.
    expect(searchHeadwords(WORDS, 'study', nothing, 20)).toEqual([])
    expect(searchHeadwords(WORDS, '', nothing, 20)).toEqual([])
    expect(searchHeadwords(WORDS, '   ', nothing, 20)).toEqual([])
  })

  test('returns nothing when the query matches no headword', () => {
    expect(searchHeadwords(WORDS, '龘', nothing, 20)).toEqual([])
  })
})

describe('Lexicon.search', () => {
  const lexicon = chinesePack.load(
    [...WORDS].map(([headword, pinyin]) => `${headword}\t${pinyin}`).join('\n'),
  )

  test('a query that cannot match never walks the index', () => {
    // 198k entries, on every keystroke. Pinyin is not an index into them and
    // neither is English, so both are answered from the query alone.
    expect(lexicon.search('xue2', nothing, 20)).toEqual([])
    expect(lexicon.search('study', nothing, 20)).toEqual([])
    expect(lexicon.search('', nothing, 20)).toEqual([])
  })

  test('hands a real query to the same ranking the box has always used', () => {
    expect(lexicon.search('学', nothing, 3)).toEqual(searchHeadwords(WORDS, '学', nothing, 3))
  })
})
