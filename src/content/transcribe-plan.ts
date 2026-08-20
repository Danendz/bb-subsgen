// Whether to transcribe this video, when, and what to say about it meanwhile.
//
// Extracted from `content/main.ts` because it is four independent inputs
// collapsing into four answers, and getting one of those answers subtly wrong
// is invisible until it is on screen over somebody's video.
//
// The distinction that earns this its own file is `transcribing` versus
// `running`. They are not the same question and reading one as the other is
// what put a permanent "Transcribing…" over videos the extension was still
// asking about.

import type { Confidence } from '../media/site'

/** When a run begins, if it ever does. */
export type TranscribeStart = 'now' | 'on-playback' | 'ask' | 'never'

export interface Situation {
  /** How sure the site is that this video is Chinese. */
  confidence: Confidence
  /**
   * A channel already said yes to.
   *
   * Outranks this video's own reading: saying yes meant "this publisher is
   * Chinese", which holds however weakly the next video happens to read.
   */
  approved: boolean
  /** This video already said no to, for this session. */
  refused: boolean
  /** Whether the published track is dense enough to be this video's dialogue. */
  usable: boolean
  /** Whether a speech server is configured at all. */
  canTranscribe: boolean
}

export interface TranscribePlan {
  start: TranscribeStart
  /**
   * Whether the overlay is standing in for a transcript rather than a track.
   *
   * Still true while the answer is `ask` or `on-playback`: the overlay has to
   * exist to carry the question, the cue subscription has to be live before the
   * run it will receive is allowed to begin, and any published track is
   * discarded either way.
   */
  transcribing: boolean
  /**
   * Whether a run is under way as the video loads — which is the only thing the
   * progress pill may report.
   *
   * Narrower than `transcribing` on purpose. A video being asked about has
   * spent nothing and has no run to report; a pill over it claims work that is
   * not happening, and because no run will ever complete, nothing would take it
   * back down. The `ask` and `on-playback` paths raise this themselves at the
   * moment they actually start.
   */
  running: boolean
  /** One line for the console, saying which of these branches was taken and why. */
  verdict: string
}

export function planTranscription({
  confidence,
  approved,
  refused,
  usable,
  canTranscribe,
}: Situation): TranscribePlan {
  const start: TranscribeStart =
    confidence === 'negative'
      ? 'never'
      : confidence === 'certain' || approved
        ? 'now'
        : refused
          ? 'never'
          : confidence === 'likely'
            ? 'on-playback'
            : 'ask'

  const transcribing = !usable && canTranscribe && start !== 'never'

  const verdict = usable
    ? 'using the track'
    : !canTranscribe
      ? 'speech to text is off (Settings → Speech to text)'
      : start === 'never'
        ? `not transcribing — ${confidence === 'negative' ? 'this is not a Chinese video' : 'declined for now'}`
        : start === 'now'
          ? 'transcribing'
          : start === 'on-playback'
            ? 'probably Chinese; transcribing once it has been watched a while'
            : 'not recognised as Chinese; asking'

  return { start, transcribing, running: transcribing && start === 'now', verdict }
}
