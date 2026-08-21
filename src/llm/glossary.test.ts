import { describe, expect, test } from 'vitest'
import type { CedictEntry } from '../lang/pack'
import { glossFor, glossLine, splitByKnown, translationGlossary } from './glossary'

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

describe('translationGlossary', () => {
  const defs: Record<string, CedictEntry[]> = {
    了: [entry()],
    北京: [entry({ simplified: '北京', pinyin: 'Bei3jing1', definitions: ['Beijing'] })],
    莫名其妙: [
      entry({ simplified: '莫名其妙', pinyin: 'mo4 ming2 qi2 miao4', definitions: ['baffling'] }),
    ],
    张伟: [],
  }

  // Glossing 了 and 的 on every batch would fill the limit with grammar the
  // model already has cold.
  test('leaves single characters out', () => {
    expect(translationGlossary(['了', '北京'], defs).map((g) => g.word)).toEqual(['北京'])
  })

  // A four-character CC-CEDICT entry is almost always an idiom or a name.
  test('puts the longest entries first, where the idioms are', () => {
    expect(translationGlossary(['北京', '莫名其妙'], defs).map((g) => g.word)).toEqual([
      '莫名其妙',
      '北京',
    ])
  })

  test('drops words the dictionary cannot gloss', () => {
    expect(translationGlossary(['张伟', '北京'], defs).map((g) => g.word)).toEqual(['北京'])
  })

  test('does not repeat a word that recurs across the batch', () => {
    expect(translationGlossary(['北京', '北京'], defs)).toHaveLength(1)
  })

  test('caps the list so the prompt stays affordable', () => {
    expect(translationGlossary(['北京', '莫名其妙'], defs, 1).map((g) => g.word)).toEqual([
      '莫名其妙',
    ])
  })
})

describe('glossLine', () => {
  test('reads as a dictionary line', () => {
    expect(glossLine({ word: '了', pinyin: 'le5', gloss: 'completed action' })).toBe(
      '了 (le5) — completed action',
    )
  })
})
