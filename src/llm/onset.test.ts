import { describe, expect, test } from 'vitest'
import type { Cue } from '../bilibili/subtitles'
import { findOnset, snapToOnset } from './onset'

const RATE = 16_000

const cue = (start: number, end: number, text = '一二三四'): Cue => ({ start, end, text })

/**
 * A track built out of stretches, each at a fixed amplitude.
 *
 * A tone rather than noise so the frame levels are exactly what the amplitude
 * says, and a test that fails says something about the rule rather than about
 * which random numbers it happened to get.
 */
function track(...parts: Array<{ seconds: number; level: number }>): Float32Array {
  const total = parts.reduce((sum, part) => sum + Math.round(part.seconds * RATE), 0)
  const samples = new Float32Array(total)

  let at = 0
  for (const part of parts) {
    const until = at + Math.round(part.seconds * RATE)
    for (; at < until; at++) samples[at] = part.level * Math.sin((2 * Math.PI * 440 * at) / RATE)
  }
  return samples
}

const silence = (seconds: number) => ({ seconds, level: 0 })
const voice = (seconds: number, level = 0.5) => ({ seconds, level })

describe('findOnset', () => {
  test('finds the voice after a silence', () => {
    const samples = track(silence(1), voice(1))
    expect(findOnset(samples, 0, 2)).toBeCloseTo(1, 1)
  })

  test('declines a window that opens on the voice', () => {
    // The case that matters most: a line the model timed correctly must come
    // back untouched rather than be dragged to some later syllable.
    expect(findOnset(track(voice(2)), 0, 2)).toBeNull()
  })

  test('declines a silence too short to be a pause', () => {
    // 100ms in front of a line is the model being slightly early, not a gap
    // between sentences, and moving the line for it would be noise.
    expect(findOnset(track(silence(0.1), voice(1)), 0, 1.1)).toBeNull()
  })

  test('finds the voice over a music bed it is louder than', () => {
    // What an absolute threshold could not do: the bed already clears any level
    // fixed in advance, and only the contrast within this window gives it away.
    const samples = track({ seconds: 1, level: 0.05 }, { seconds: 1, level: 0.5 })
    expect(findOnset(samples, 0, 2)).toBeCloseTo(1, 1)
  })

  test('declines a bed as loud as the voice over it', () => {
    // No contrast to read, so no claim is made. Leaving the line early is the
    // lesser failure; moving it to the wrong place is not recoverable.
    const samples = track({ seconds: 1, level: 0.4 }, { seconds: 1, level: 0.5 })
    expect(findOnset(samples, 0, 2)).toBeNull()
  })

  test('declines a window with no sound in it at all', () => {
    expect(findOnset(track(silence(2)), 0, 2)).toBeNull()
  })

  test('is not confused by a pause in the middle of a line', () => {
    // Speech, a breath, more speech. The onset is at the front, so nothing moves
    // — the rule looks for quiet *before* the first sound, not anywhere.
    const samples = track(voice(0.6), silence(0.5), voice(0.6))
    expect(findOnset(samples, 0, 1.7)).toBeNull()
  })

  test('reads only the window it was given', () => {
    // The voice before the window must not count as its onset, nor suppress it.
    const samples = track(voice(1), silence(1), voice(1))
    expect(findOnset(samples, 1, 3)).toBeCloseTo(1, 1)
  })

  test('answers null for a window too short to frame', () => {
    expect(findOnset(track(voice(1)), 0, 0.01)).toBeNull()
    expect(findOnset(new Float32Array(0), 0, 2)).toBeNull()
  })
})

describe('snapToOnset', () => {
  test('moves a line onto its voice, keeping a moment of lead-in', () => {
    const samples = track(silence(3), voice(2))
    const [line] = snapToOnset([cue(0, 5)], samples)

    // The onset is at 3s; the line starts a little before it so the first
    // consonant is not clipped.
    expect(line.start).toBeGreaterThan(2.8)
    expect(line.start).toBeLessThan(3)
    expect(line.end).toBe(5)
  })

  test('leaves a line that was already right exactly as it was', () => {
    const samples = track(voice(2))
    const original = cue(0, 2)
    expect(snapToOnset([original], samples)).toEqual([original])
  })

  test('never leaves a line too short to read', () => {
    // The voice arrives in the last fifth of a second of the window; the line
    // keeps its minimum rather than flashing.
    const samples = track(silence(4.8), voice(0.2))
    const [line] = snapToOnset([cue(0, 5)], samples)
    expect(line.start).toBeCloseTo(4.4, 5)
  })

  test('only ever moves a start later', () => {
    const samples = track(silence(1), voice(1))
    const [line] = snapToOnset([cue(0.95, 2)], samples)
    expect(line.start).toBeGreaterThanOrEqual(0.95)
  })

  test('handles several lines, and an empty list', () => {
    const samples = track(silence(1), voice(1), silence(1), voice(1))
    const [first, second] = snapToOnset([cue(0, 2), cue(2, 4)], samples)

    // Each onset less the lead-in, and each read from its own window.
    expect(first.start).toBeCloseTo(0.88, 2)
    expect(second.start).toBeCloseTo(2.88, 2)
    expect(snapToOnset([], samples)).toEqual([])
  })

  test('leaves the cues and the samples it was given alone', () => {
    const samples = track(silence(1), voice(1))
    const before = samples.slice()
    const cues = [cue(0, 2)]

    snapToOnset(cues, samples)

    expect(cues).toEqual([cue(0, 2)])
    expect(samples).toEqual(before)
  })
})
