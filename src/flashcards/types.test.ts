import { describe, expect, test } from 'vitest'
import { grammarId, namespaceLegacyId, sentenceId, wordId } from './types'

describe('item ids', () => {
  test('derives a grammar id from the pattern, not from the line it was met in', () => {
    // Two browsers meeting this pattern in different videos derive one card, the
    // same way two sightings of a word do.
    expect(grammarId('zh', 'de-complement')).toBe('g:zh:de-complement')
  })

  test('keeps the three kinds of id apart', () => {
    const ids = new Set([
      grammarId('zh', 'shi-de'),
      wordId('zh', 'shi-de'),
      sentenceId('zh', 'shi-de'),
    ])
    expect(ids.size).toBe(3)
  })

  test('keeps the same headword in two languages apart — 生 is two words', () => {
    // The whole reason ids carry a language. Before this they were one card,
    // sharing one review history, one exposure count and one HSK rank.
    expect(wordId('zh', '生')).not.toBe(wordId('ja', '生'))
  })
})

describe('namespaceLegacyId', () => {
  test('lands exactly where the current builders do, for all three kinds', () => {
    // The database migration and the version-3 backup lift both go through this.
    // If it disagreed with the builders by a character, a migrated review would
    // point at a card that is not there.
    expect(namespaceLegacyId('zh', 'w:生')).toBe(wordId('zh', '生'))
    expect(namespaceLegacyId('zh', 's:他很憔悴。')).toBe(sentenceId('zh', '他很憔悴。'))
    expect(namespaceLegacyId('zh', 'g:de-complement')).toBe(grammarId('zh', 'de-complement'))
  })

  test('leaves a sentence containing a colon whole', () => {
    // Inserting rather than splitting is the point: a line can hold any
    // character, and `s:A:B` split on ':' is a different sentence.
    expect(namespaceLegacyId('zh', 's:他说：好')).toBe('s:zh:他说：好')
  })
})
