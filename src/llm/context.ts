// Rebuilding the passage a captured line came from.
//
// A `Context` stores one line plus where it was met (`videoId` and `start`). The
// surrounding lines are not stored — they are fetched back from the track when
// an explanation is actually asked for, which costs nothing until then and
// works on every word collected before this feature existed.
//
// Pure: fetching belongs to the caller, and everything hard here is the
// locating.

import type { Cue } from '../media/cue'

/**
 * How many lines either side are sent.
 *
 * Ten is enough to carry a topic chain across a few turns, which is what
 * Chinese actually needs — dropped pronouns and no tense marking mean a line
 * often cannot be read alone — and short enough to leave room in a small
 * model's context for the reply.
 */
export const WINDOW_RADIUS = 10

export interface LineWindow {
  before: string[]
  line: string
  after: string[]
}

function same(a: string, b: string): boolean {
  return a.trim() === b.trim()
}

/**
 * Where a captured line sits in a freshly fetched track, or -1.
 *
 * Located by text rather than by timestamp, deliberately. A videoId identifies a
 * video but not which part of a multi-part one, so the track fetched here may
 * not be the track the line came from; and a re-cut or re-timed track moves
 * every start. Matching the text is what makes a wrong answer detectable
 * instead of silently producing somebody else's passage.
 *
 * `start` only breaks ties — a line like 「对」 repeats all through a video, and
 * the nearest occurrence to where it was captured is the one that was meant.
 */
export function locateLine(cues: Cue[], text: string, start?: number): number {
  const matches: number[] = []
  for (let i = 0; i < cues.length; i += 1) {
    if (same(cues[i].text, text)) matches.push(i)
  }

  if (matches.length === 0) return -1
  if (matches.length === 1 || start === undefined) return matches[0]

  return matches.reduce((best, index) =>
    Math.abs(cues[index].start - start) < Math.abs(cues[best].start - start) ? index : best,
  )
}

/** The lines either side of `index`, clamped at the ends of the track. */
export function windowAround(cues: Cue[], index: number, radius = WINDOW_RADIUS): LineWindow {
  return {
    before: cues.slice(Math.max(0, index - radius), index).map((cue) => cue.text),
    line: cues[index].text,
    after: cues.slice(index + 1, index + 1 + radius).map((cue) => cue.text),
  }
}

/**
 * The passage around a captured line, or null when the track doesn't contain it.
 *
 * Null is a real answer and not a failure: the video may have been re-cut, or
 * this may be the wrong part of a multi-part one. The caller falls back to the
 * single line it already had, which is what the card has always shown.
 */
export function lineWindow(
  cues: Cue[],
  text: string,
  start?: number,
  radius = WINDOW_RADIUS,
): LineWindow | null {
  const index = locateLine(cues, text, start)
  return index === -1 ? null : windowAround(cues, index, radius)
}
