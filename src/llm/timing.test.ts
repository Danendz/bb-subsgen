import { describe, expect, test } from 'vitest'
import type { Cue } from '../media/cue'
import { alignCues, holdTail, MAX_HOLD_S } from './timing'

const cue = (start: number, end: number, text = '今天天气非常好啊'): Cue => ({ start, end, text })

describe('holdTail', () => {
  test('holds a line until the next one starts', () => {
    // A gap inside the cap, so it is the next line that ends this one.
    const [first] = holdTail([cue(0, 1), cue(2, 3)])
    expect(first.end).toBe(2)
  })

  test('never outstays the cap, however long the silence', () => {
    // The gaps between utterances run to ten seconds on a documentary; a line
    // sitting through one of them is a stale line over the video.
    const [first] = holdTail([cue(0, 1), cue(90, 91)])
    expect(first.end).toBe(1 + MAX_HOLD_S)
  })

  test('never shortens a line that already runs into the next', () => {
    // Whisper does emit overlapping lines; holding must not become a way to
    // trim one.
    const [first] = holdTail([cue(0, 5), cue(3, 6)])
    expect(first.end).toBe(5)
  })

  test('leaves the last line alone — there is nothing to hold it for', () => {
    const cues = [cue(0, 1), cue(3, 4)]
    expect(holdTail(cues).at(-1)).toEqual(cues[1])
  })
})

describe('alignCues', () => {
  test('carries a line across the breath before the next one', () => {
    const [first, second] = alignCues([cue(0, 2), cue(3, 6)])
    expect(first.end).toBe(3)
    expect(second).toEqual(cue(3, 6))
  })

  test('leaves a track with no gaps in it untouched', () => {
    const cues = [cue(0, 2), cue(2, 4), cue(4, 6)]
    expect(alignCues(cues)).toEqual(cues)
  })

  test('handles an empty track and a single line', () => {
    expect(alignCues([])).toEqual([])
    expect(alignCues([cue(0, 2)])).toEqual([cue(0, 2)])
  })

  test('leaves the cues it was given untouched', () => {
    // The caller's array is the transcript cache's copy in all but name.
    const cues = [cue(0, 2), cue(6, 8)]
    alignCues(cues)
    expect(cues).toEqual([cue(0, 2), cue(6, 8)])
  })
})
