// Decides what the overlay's progress pill says and whether it shows at all.
//
// Kept pure and separate from the DOM because the interesting part is the
// visibility rule, not the markup.

export type ProgressState =
  | { phase: 'idle' }
  | { phase: 'download'; label: string; fraction: number }
  | { phase: 'pass'; done: number; total: number }
  /** Chunks of audio turned into lines. `total` is 0 until the plan is known. */
  | { phase: 'transcribe'; done: number; total: number }

export interface ProgressView {
  visible: boolean
  text: string
  fraction: number
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

/**
 * The download phase always reports, because nothing at all can happen until
 * the pack lands. The pass only reports while `waiting` — playhead-first
 * ordering means it gets ahead of the viewer within seconds, and a bar tracking
 * background work nobody is blocked on is just something covering the video.
 */
export function progressView(state: ProgressState, waiting: boolean): ProgressView {
  if (state.phase === 'download') {
    return {
      visible: true,
      text: `Downloading ${state.label}… ${Math.round(state.fraction * 100)}%`,
      fraction: state.fraction,
    }
  }

  // Always reports, for the same reason the download does: until it finishes
  // there are no cues at all, so there is nothing on screen for it to cover and
  // nobody who is not waiting on it. `total` is 0 until the chunk plan comes
  // back, which is a bar with no width rather than a bar that lies.
  if (state.phase === 'transcribe') {
    return {
      visible: true,
      text: state.total
        ? `Transcribing… ${state.done} / ${state.total}`
        : 'Transcribing…',
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
