// Decides what the overlay's progress pill says and whether it shows at all.
//
// Kept pure and separate from the DOM because the interesting part is the
// visibility rule, not the markup.

export type ProgressState =
  | { phase: 'idle' }
  | { phase: 'download'; label: string; fraction: number }
  | { phase: 'pass'; done: number; total: number }

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
