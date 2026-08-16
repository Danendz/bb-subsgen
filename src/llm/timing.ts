// Making a speech model's timings watchable.
//
// Whisper's line timings are not where the speech is, and the way this server is
// asked for subtitle-shaped output is what exposes it. `--max-len 24` makes every
// visible line a *split* of one of Whisper's own segments, and the split points
// come from an experimental heuristic that spreads a segment's tokens across its
// `[t0, t1]` in proportion to how long each looks like it takes to say. That
// would be fine if `t0` were where the speech starts — but a segment that does
// not open on a timestamp token inherits the *end of the previous segment*, so
// the pause before a sentence is attached to the front of its first line, and
// the proportional spread drags the rest of them early behind it.
//
// The server-side answer is voice-activity detection, which deletes the pause
// before the model ever sees it; see tools/asr-server.sh. These two rules are
// what is left over — they cost nothing, they work on transcripts recorded
// before that flag existed, and they are the only part of this that also applies
// to a speech server that is not whisper.cpp.
//
// Applied on the way to the screen, never to what is stored. The transcript cache
// keeps what the model actually said, so improving these rules costs a reload
// rather than transcribing an episode again.

import type { Cue } from '../bilibili/subtitles'

/**
 * The slowest anyone plausibly speaks, in characters a second.
 *
 * Real Mandarin narration runs at roughly twice this. Deliberately so: this
 * number decides how long a line's window has to be before the excess is treated
 * as a pause that got attached to it, and being wrong in the generous direction
 * means leaving a slightly early line alone, while being wrong in the strict
 * direction means delaying a line that was correct.
 */
export const SLOWEST_CHARS_PER_S = 2.5

/** Even one character needs a moment, and a one-frame line is not readable. */
export const MIN_LINE_S = 0.8

/**
 * The longest a line may outstay its own end, waiting for the next.
 *
 * Enough to carry across the gap between two sentences; not enough for a line to
 * sit over a minute of music because nobody spoke again.
 */
export const MAX_HOLD_S = 3

export interface AlignOptions {
  charsPerSecond?: number
  minLine?: number
  hold?: number
}

/** Characters that take time to say — whitespace does not. */
function spokenLength(text: string): number {
  return [...text.replace(/\s+/g, '')].length
}

/**
 * The lead a split line absorbed from the pause in front of it, taken back.
 *
 * A line's text needs a certain minimum time to say, and its end is the one
 * timing Whisper gets right — it is where the speech stopped. So where the
 * window is longer than the words can account for, the excess is at the front,
 * and pulling the start towards the end is what puts the line back on its voice.
 *
 * Starts only ever move later and ends never move, which is what makes this safe
 * to run over a normally-timed line: there is nothing for it to do to one.
 */
export function trimLead(cues: Cue[], charsPerSecond = SLOWEST_CHARS_PER_S, minLine = MIN_LINE_S): Cue[] {
  return cues.map((cue) => {
    const needed = Math.max(minLine, spokenLength(cue.text) / charsPerSecond)
    const start = cue.end - needed
    return start > cue.start ? { ...cue, start } : cue
  })
}

/**
 * Each line held until the next one starts, rather than blinking out.
 *
 * Whisper ends a line at its last word, so a line is gone the moment the speaker
 * pauses — and with lines capped at 24 characters, that is most of them. Holding
 * them means the pause `trimLead` just gave back is covered by the sentence being
 * spoken through it, instead of by nothing.
 *
 * A line is never shortened, never overruns the next one, and the last one keeps
 * its own end: there is nothing after it to hold for.
 */
export function holdTail(cues: Cue[], hold = MAX_HOLD_S): Cue[] {
  return cues.map((cue, at) => {
    const next = cues[at + 1]
    if (!next) return cue
    const end = Math.min(next.start, cue.end + hold)
    return end > cue.end ? { ...cue, end } : cue
  })
}

/**
 * A transcript, re-timed for reading against a video.
 *
 * Trim before hold, so the hold is measured against the starts the lines will
 * actually have rather than the ones they arrived with.
 */
export function alignCues(cues: Cue[], options: AlignOptions = {}): Cue[] {
  const { charsPerSecond, minLine, hold } = options
  return holdTail(trimLead(cues, charsPerSecond, minLine), hold)
}
