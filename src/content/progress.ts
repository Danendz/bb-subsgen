// Decides what the overlay's progress pill says and whether it shows at all.
//
// Kept pure and separate from the DOM because the interesting part is the
// visibility rule, not the markup.
//
// One rule underlies all of it: report only what somebody is actually waiting
// on. A bar tracking background work nobody is blocked on is just something
// covering the video.

/** A stretch of the track, in seconds. */
export type Span = [start: number, end: number]

export type ProgressState =
  | { phase: 'idle' }
  | { phase: 'download'; label: string; fraction: number }
  | { phase: 'pass'; done: number; total: number }
  /**
   * Chunks of audio turned into lines. `total` is 0 until the plan is known,
   * and `covered` holds the stretches of track already transcribed.
   */
  | { phase: 'transcribe'; done: number; total: number; covered: Span[] }

export interface ProgressView {
  visible: boolean
  text: string
  fraction: number
}

/** What the viewer's situation is, which is what decides visibility. */
export interface Watching {
  /** Whether the line on screen is still missing its translation. */
  waiting: boolean
  /** Where playback is, in seconds. */
  playhead: number
}

const HIDDEN: ProgressView = { visible: false, text: '', fraction: 0 }

/**
 * Whether the viewer is actually missing a line right now.
 *
 * `currentIndex` is -1 in the gaps between cues, where there is nothing on
 * screen to be missing.
 */
export function isWaiting(
  currentIndex: number,
  hasTranslation: (index: number) => boolean,
): boolean {
  return currentIndex >= 0 && !hasTranslation(currentIndex)
}

/** Whether `at` falls inside any of the stretches already transcribed. */
export function covers(spans: Span[], at: number): boolean {
  return spans.some(([start, end]) => at >= start && at < end)
}

/**
 * The download phase always reports, because nothing at all can happen until
 * the pack lands. The other two report only while the viewer is stuck: the pass
 * while the line on screen has no translation, transcription while the stretch
 * being watched has not been transcribed yet.
 */
export function progressView(state: ProgressState, { waiting, playhead }: Watching): ProgressView {
  if (state.phase === 'download') {
    return {
      visible: true,
      text: `Downloading ${state.label}… ${Math.round(state.fraction * 100)}%`,
      fraction: state.fraction,
    }
  }

  // Chunks are transcribed playhead-first, so within a chunk of joining you have
  // lines and the rest of the run is no longer anything you are waiting for.
  //
  // Coverage comes from the chunk plan rather than from the cues, because cues
  // cannot answer this: a chunk over a silent stretch is transcribed perfectly
  // and yields none, and a documentary with a minute of no narration would
  // otherwise put the bar back over the video mid-playback.
  if (state.phase === 'transcribe') {
    if (covers(state.covered, playhead)) return HIDDEN
    return {
      visible: true,
      // `total` is 0 until the chunk plan comes back, which is a bar with no
      // width rather than a bar that lies.
      text: state.total ? `Transcribing… ${state.done} / ${state.total}` : 'Transcribing…',
      fraction: state.total ? state.done / state.total : 0,
    }
  }

  if (state.phase === 'pass') {
    if (state.total === 0 || state.done >= state.total || !waiting) return HIDDEN
    return {
      visible: true,
      text: `Translating… ${state.done} / ${state.total}`,
      fraction: state.done / state.total,
    }
  }

  return HIDDEN
}
