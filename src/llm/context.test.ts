import { describe, expect, test } from 'vitest'
import type { Cue } from '../media/cue'
import { lineWindow, locateLine, windowAround, WINDOW_RADIUS } from './context'

function track(...texts: string[]): Cue[] {
  return texts.map((text, i) => ({ start: i * 2, end: i * 2 + 1.8, text }))
}

describe('locateLine', () => {
  test('finds the line', () => {
    expect(locateLine(track('一', '二', '三'), '二')).toBe(1)
  })

  test('ignores surrounding whitespace on both sides', () => {
    expect(locateLine(track('一', '  二 '), '二')).toBe(1)
  })

  test('is -1 when the track does not contain it', () => {
    // A re-cut video, or the wrong part of a multi-part one.
    expect(locateLine(track('一', '二'), '十')).toBe(-1)
  })

  // Short lines repeat constantly in speech; the one that was captured is the
  // one nearest to where it was captured.
  test('breaks a tie on the nearest start', () => {
    const cues = track('对', '一', '对', '二', '对')

    expect(locateLine(cues, '对', 0)).toBe(0)
    expect(locateLine(cues, '对', 4)).toBe(2)
    expect(locateLine(cues, '对', 8)).toBe(4)
  })

  test('takes the first match when there is no time to go on', () => {
    expect(locateLine(track('对', '一', '对'), '对')).toBe(0)
  })

  test('is -1 for an empty track', () => {
    expect(locateLine([], '一', 0)).toBe(-1)
  })
})

describe('windowAround', () => {
  const cues = track('1', '2', '3', '4', '5', '6', '7')

  test('takes the lines either side', () => {
    expect(windowAround(cues, 3, 2)).toEqual({
      before: ['2', '3'],
      line: '4',
      after: ['5', '6'],
    })
  })

  test('clamps at the start of the track', () => {
    expect(windowAround(cues, 1, 3)).toEqual({ before: ['1'], line: '2', after: ['3', '4', '5'] })
  })

  test('clamps at the end of the track', () => {
    expect(windowAround(cues, 5, 3)).toEqual({
      before: ['3', '4', '5'],
      line: '6',
      after: ['7'],
    })
  })

  test('a single-line track has nothing around it', () => {
    expect(windowAround(track('only'), 0)).toEqual({ before: [], line: 'only', after: [] })
  })

  test('defaults to the shipped radius', () => {
    const long = track(...Array.from({ length: 50 }, (_, i) => String(i)))

    expect(windowAround(long, 25).before).toHaveLength(WINDOW_RADIUS)
    expect(windowAround(long, 25).after).toHaveLength(WINDOW_RADIUS)
  })
})

describe('lineWindow', () => {
  test('is the passage around the captured line', () => {
    expect(lineWindow(track('一', '二', '三'), '二', 2, 1)).toEqual({
      before: ['一'],
      line: '二',
      after: ['三'],
    })
  })

  // Null is a real answer: the caller falls back to the single stored line.
  test('is null when the line is not in this track', () => {
    expect(lineWindow(track('一', '二'), '十', 0)).toBeNull()
  })
})
