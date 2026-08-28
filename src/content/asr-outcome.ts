// What one message from a transcription run changes.
//
// A record rather than a union, unlike `settings-effect.ts`: a chunk landing
// updates several independent things at once — the pill, the coverage it draws
// from, the notice, the port and the model pass — and they are not alternatives.
//
// Deliberately not owned by this: the `videoId` guard that drops a previous
// video's run, the cue-list rewrite (`alignCues` is tested in `llm/timing`, and
// the mutate-in-place discipline belongs where the array is), and starting the
// on-device pass, which happens on every message and would be a field that is
// always true.

import type { Span } from './progress'
import type { AsrCuesMessage } from '../shared/messages'

/** Chunks finished against chunks expected, plus what the bar should already be filled to. */
export interface TranscribeState {
  done: number
  total: number
  covered: Span[]
}

export interface AsrOutcome {
  /** Progress while a run is live; null once there is nothing left to report. */
  transcribeState: TranscribeState | null
  /** Coverage to carry into the next message, whether or not this one named any. */
  covered: Span[]
  /** Retry text. Null means leave the notice exactly as it is. */
  notice: string | null
  /** Whether the worker can be let go of. */
  releasePort: boolean
  /** Whether the model pass may start now. */
  startLlm: boolean
}

/**
 * Reads one `asr-cues` message against the coverage the last one left.
 *
 * `covered` is carried forward rather than defaulted to empty because a retry
 * re-fetches and re-decodes before it can say anything, and without the carry
 * the bar would blanket a video that already has forty-five minutes of
 * subtitles for the half-minute that takes. What the previous run last sent is
 * exactly right: it is the complement of the stretches still missing.
 *
 * A completed run reports no progress at all, error or not. There is nothing
 * further coming, so a pill left up would stay over the video for good.
 *
 * The model pass waits for the whole track. There is one GPU behind all of this
 * and the speech server is on it until the last chunk lands; a pass racing it
 * would finish later than the two run in order. It also gets batch seams that
 * are actually adjacent, which a growing track does not.
 */
export function asrOutcome(msg: AsrCuesMessage, covered: Span[]): AsrOutcome {
  if (msg.complete) {
    return {
      transcribeState: null,
      covered,
      // A new failure is worth showing even where the last one was dismissed,
      // which is the caller's half of this: it clears the dismissal.
      notice: msg.error ?? null,
      releasePort: true,
      startLlm: true,
    }
  }

  const next = msg.covered ?? covered
  return {
    transcribeState: { done: msg.done, total: msg.total, covered: next },
    covered: next,
    notice: null,
    releasePort: false,
    startLlm: false,
  }
}
