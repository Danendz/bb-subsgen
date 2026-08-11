import { describe, expect, test } from 'vitest'
import { findActiveCueIndex } from './sync'
import type { Cue } from '../bilibili/subtitles'

const cues: Cue[] = [
  { start: 1, end: 3, text: 'a' },
  { start: 3, end: 5, text: 'b' },
  { start: 7, end: 9, text: 'c' },
]

describe('findActiveCueIndex', () => {
  test('finds the cue containing the current time', () => {
    expect(findActiveCueIndex(cues, 2)).toBe(0)
    expect(findActiveCueIndex(cues, 4)).toBe(1)
    expect(findActiveCueIndex(cues, 8)).toBe(2)
  })

  test('treats cue start as inclusive and end as exclusive', () => {
    expect(findActiveCueIndex(cues, 3)).toBe(1)
    expect(findActiveCueIndex(cues, 5)).toBe(-1)
  })

  test('returns -1 in a gap between cues', () => {
    expect(findActiveCueIndex(cues, 6)).toBe(-1)
  })

  test('returns -1 before the first cue and after the last', () => {
    expect(findActiveCueIndex(cues, 0)).toBe(-1)
    expect(findActiveCueIndex(cues, 100)).toBe(-1)
  })

  test('returns -1 for an empty cue list', () => {
    expect(findActiveCueIndex([], 5)).toBe(-1)
  })
})
