// How long a transcribed line stays on screen once it has arrived.
//
// Where it arrives is settled elsewhere, and by measurement: llm/onset.ts moves
// each line onto the sound it describes, using the decoded audio while the
// offscreen document still has it. This is the other half, and it is only about
// reading — so it lives on the display side, where changing it costs a reload
// rather than transcribing an episode again.
//
// Whisper ends a line at its last word. With lines capped at 24 characters that
// is most of a sentence's worth of them, each vanishing the instant the speaker
// draws breath, which reads as flicker rather than as subtitles.

import type { Cue } from '../bilibili/subtitles'

/**
 * The longest a line may outstay its own end, waiting for the next.
 *
 * A moment to finish reading, and no more. It was three seconds until the gaps
 * between utterances turned out to run to ten — at which point a generous hold
 * is just a stale line sitting over the video long after its voice has gone.
 */
export const MAX_HOLD_S = 1.5

export interface AlignOptions {
  hold?: number
}

/**
 * Each line held a little past its end, but never into the next one.
 *
 * A line is never shortened, so an overlapping pair is left as it came, and the
 * last line keeps its own end: there is nothing after it to hold for.
 */
export function holdTail(cues: Cue[], hold = MAX_HOLD_S): Cue[] {
  return cues.map((cue, at) => {
    const next = cues[at + 1]
    if (!next) return cue
    const end = Math.min(next.start, cue.end + hold)
    return end > cue.end ? { ...cue, end } : cue
  })
}

/** A transcript, given enough time on screen to be read. */
export function alignCues(cues: Cue[], { hold }: AlignOptions = {}): Cue[] {
  return holdTail(cues, hold)
}
