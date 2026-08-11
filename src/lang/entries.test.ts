import { describe, expect, test } from 'vitest'
import { rankEntries } from './entries'
import type { CedictEntry } from './dict'

// The real CC-CEDICT shape for 和, in file order. The variant entry keyed
// under 咊 precedes the canonical one, which is why "first wins" showed
// "old variant of 和".
const HE: CedictEntry[] = [
  { traditional: '咊', simplified: '和', pinyin: 'he2', definitions: ['old variant of 和[he2]'] },
  { traditional: '和', simplified: '和', pinyin: 'He2', definitions: ['surname He'] },
  {
    traditional: '和',
    simplified: '和',
    pinyin: 'he2',
    definitions: ['(joining two nouns) and; together with; with'],
  },
  {
    traditional: '和',
    simplified: '和',
    pinyin: 'he4',
    definitions: ['to compose a poem in reply'],
  },
  {
    traditional: '龢',
    simplified: '和',
    pinyin: 'he2',
    definitions: ['(literary) harmonious (variant of 和[he2])'],
  },
]

describe('rankEntries', () => {
  test('prefers the canonical entry over a variant that appears first', () => {
    const [primary] = rankEntries(HE, '和', 'he2')
    expect(primary.definitions[0]).toContain('together with')
  })

  test('prefers the entry matching the reading shown on the subtitle', () => {
    const [primary] = rankEntries(HE, '和', 'he4')
    expect(primary.definitions[0]).toBe('to compose a poem in reply')
  })

  test('deprioritizes a surname reading when no reading is displayed', () => {
    const [primary] = rankEntries(HE, '和')
    expect(primary.definitions[0]).toContain('together with')
  })

  test('keeps every entry, only reordering them', () => {
    expect(rankEntries(HE, '和', 'he2')).toHaveLength(HE.length)
  })

  test('prefers the traditional form when reading traditional text', () => {
    const entries: CedictEntry[] = [
      { traditional: '龍', simplified: '龙', pinyin: 'long2', definitions: ['dragon'] },
      { traditional: '竜', simplified: '龙', pinyin: 'long2', definitions: ['variant of 龍[long2]'] },
    ]
    const [primary] = rankEntries(entries, '龍', 'long2', true)
    expect(primary.definitions[0]).toBe('dragon')
  })

  test('returns an empty array for no entries', () => {
    expect(rankEntries([], '和', 'he2')).toEqual([])
  })
})
