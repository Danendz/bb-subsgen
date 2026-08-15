import { describe, expect, test } from 'vitest'
import type { CedictEntry } from '../lang/dict'
import { glossFor, glossLine, splitByKnown } from './glossary'

function entry(over: Partial<CedictEntry> = {}): CedictEntry {
  return {
    simplified: '了',
    traditional: '了',
    pinyin: 'le5',
    definitions: ['completed action marker'],
    ...over,
  }
}

describe('glossFor', () => {
  test('is the ranked best entry', () => {
    expect(glossFor('了', [entry()])).toEqual({
      word: '了',
      pinyin: 'le5',
      gloss: 'completed action marker',
    })
  })

  test('joins a couple of senses, not all of them', () => {
    const many = entry({ definitions: ['one', 'two', 'three', 'four'] })

    expect(glossFor('了', [many])!.gloss).toBe('one; two')
  })

  test('is null when the dictionary has nothing', () => {
    expect(glossFor('了', [])).toBeNull()
    expect(glossFor('了', undefined)).toBeNull()
  })

  test('is null when the entry carries no definition', () => {
    expect(glossFor('了', [entry({ definitions: [] })])).toBeNull()
  })
})

describe('splitByKnown', () => {
  const defs: Record<string, CedictEntry[]> = {
    我: [entry({ simplified: '我', pinyin: 'wo3', definitions: ['I; me'] })],
    吃: [entry({ simplified: '吃', pinyin: 'chi1', definitions: ['to eat'] })],
    了: [entry()],
  }

  test('sorts words either side of what you know', () => {
    const split = splitByKnown(['我', '吃', '了'], new Set(['我', '吃']), defs)

    expect(split.known).toEqual(['我', '吃'])
    expect(split.fresh.map((g) => g.word)).toEqual(['了'])
  })

  test('does not repeat a word that appears twice in the line', () => {
    const split = splitByKnown(['我', '吃', '我'], new Set(['我']), defs)

    expect(split.known).toEqual(['我'])
  })

  // A name the dictionary has never heard of tells the model nothing the line
  // did not already say.
  test('drops unknown words the dictionary cannot gloss', () => {
    const split = splitByKnown(['吃', '张伟'], new Set(), defs)

    expect(split.fresh.map((g) => g.word)).toEqual(['吃'])
  })

  test('a known word is listed even without a dictionary entry', () => {
    const split = splitByKnown(['张伟'], new Set(['张伟']), defs)

    expect(split.known).toEqual(['张伟'])
  })

  test('an empty line splits into nothing', () => {
    expect(splitByKnown([], new Set(), defs)).toEqual({ known: [], fresh: [] })
  })
})

describe('glossLine', () => {
  test('reads as a dictionary line', () => {
    expect(glossLine({ word: '了', pinyin: 'le5', gloss: 'completed action' })).toBe(
      '了 (le5) — completed action',
    )
  })
})
