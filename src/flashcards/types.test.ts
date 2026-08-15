import { describe, expect, test } from 'vitest'
import { grammarId, sentenceId, wordId } from './types'

describe('item ids', () => {
  test('derives a grammar id from the pattern, not from the line it was met in', () => {
    // Two browsers meeting this pattern in different videos derive one card, the
    // same way two sightings of a word do.
    expect(grammarId('de-complement')).toBe('g:de-complement')
  })

  test('keeps the three kinds of id apart', () => {
    const ids = new Set([grammarId('shi-de'), wordId('shi-de'), sentenceId('shi-de')])
    expect(ids.size).toBe(3)
  })
})
