import { describe, expect, test } from 'vitest'
import type { Cue } from '../bilibili/subtitles'
import { alignCues, holdTail, MAX_HOLD_S, MIN_LINE_S, SLOWEST_CHARS_PER_S, trimLead } from './timing'

const cue = (start: number, end: number, text: string): Cue => ({ start, end, text })

/** Eight characters, so the rules have something with a real length to measure. */
const EIGHT = '今天天气非常好啊'

describe('trimLead', () => {
  test('pulls a start forward when the window is longer than the words explain', () => {
    // Eight characters need 8 / 2.5 = 3.2s even at the slowest plausible pace, so
    // a ten-second window is nearly seven seconds of pause on the front.
    const [line] = trimLead([cue(20, 30, EIGHT)])
    expect(line.start).toBeCloseTo(30 - 8 / SLOWEST_CHARS_PER_S)
    expect(line.end).toBe(30)
  })

  test('leaves a normally timed line exactly as it was', () => {
    // The common case, and the one that must not move: eight characters in two
    // seconds is ordinary narration pace, well inside what the rule allows.
    const original = cue(20, 22, EIGHT)
    expect(trimLead([original])).toEqual([original])
  })

  test('never lets a line fall below a readable minimum', () => {
    // One character would otherwise be allotted 0.4s, which is a flicker.
    const [line] = trimLead([cue(0, 10, '好')])
    expect(line.start).toBeCloseTo(10 - MIN_LINE_S)
  })

  test('counts characters rather than bytes or whitespace', () => {
    const [spaced] = trimLead([cue(0, 30, ' 今 天 天 气 非 常 好 啊 ')])
    expect(spaced.start).toBeCloseTo(30 - 8 / SLOWEST_CHARS_PER_S)
  })

  test('only ever moves a start later', () => {
    // A line already tighter than the pace allows must not be stretched
    // backwards over whatever came before it.
    const original = cue(20, 20.5, EIGHT)
    expect(trimLead([original])).toEqual([original])
  })
})

describe('holdTail', () => {
  test('holds a line until the next one starts', () => {
    const [first] = holdTail([cue(0, 1, 'a'), cue(3, 4, 'b')])
    expect(first.end).toBe(3)
  })

  test('never overstays the cap, however long the silence', () => {
    const [first] = holdTail([cue(0, 1, 'a'), cue(90, 91, 'b')])
    expect(first.end).toBe(1 + MAX_HOLD_S)
  })

  test('never shortens a line that already runs into the next', () => {
    // Whisper does emit overlapping lines; holding must not be a way to trim one.
    const [first] = holdTail([cue(0, 5, 'a'), cue(3, 6, 'b')])
    expect(first.end).toBe(5)
  })

  test('leaves the last line alone — there is nothing to hold it for', () => {
    const cues = [cue(0, 1, 'a'), cue(3, 4, 'b')]
    expect(holdTail(cues).at(-1)).toEqual(cues[1])
  })
})

describe('alignCues', () => {
  test('gives the pause back to the line that was being spoken through it', () => {
    // The shape this exists for: a short line, then one that swallowed the pause
    // in front of it. The second should land on its voice, and the first should
    // cover the gap rather than leaving the screen blank.
    const [first, second] = alignCues([cue(0, 2, EIGHT), cue(2, 12, EIGHT)])

    expect(second.start).toBeCloseTo(12 - 8 / SLOWEST_CHARS_PER_S)
    expect(first.end).toBe(2 + MAX_HOLD_S)
    expect(first.end).toBeLessThanOrEqual(second.start)
  })

  test('measures the hold against the trimmed start, not the original one', () => {
    // Held to the start the line arrived with, the first line would end at 2 and
    // the screen would be empty for the six seconds before the second one spoke.
    const [first] = alignCues([cue(0, 1.5, '好'), cue(2, 12, EIGHT)])
    expect(first.end).toBeGreaterThan(2)
  })

  test('is unchanged over a track that was timed properly to begin with', () => {
    // A well-timed track with no gaps has nothing for either rule to do.
    const cues = [cue(0, 2, EIGHT), cue(2, 4, EIGHT), cue(4, 6, EIGHT)]
    expect(alignCues(cues)).toEqual(cues)
  })

  test('handles an empty track and a single line', () => {
    expect(alignCues([])).toEqual([])
    expect(alignCues([cue(0, 2, EIGHT)])).toEqual([cue(0, 2, EIGHT)])
  })

  test('leaves the cues it was given untouched', () => {
    // The caller's array is the transcript cache's copy in all but name.
    const cues = [cue(0, 2, EIGHT), cue(2, 12, EIGHT)]
    alignCues(cues)
    expect(cues).toEqual([cue(0, 2, EIGHT), cue(2, 12, EIGHT)])
  })

  test('keeps every line in order and none of them backwards', () => {
    const cues = [cue(0, 4, '好'), cue(4, 20, EIGHT), cue(20, 21, EIGHT), cue(30, 33, EIGHT)]
    const aligned = alignCues(cues)
    for (const line of aligned) expect(line.end).toBeGreaterThan(line.start)
    for (let at = 1; at < aligned.length; at++) {
      expect(aligned[at].start).toBeGreaterThanOrEqual(aligned[at - 1].start)
      expect(aligned[at - 1].end).toBeLessThanOrEqual(aligned[at].start)
    }
  })
})
