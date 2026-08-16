// How a translation pass reads in the popup.
//
// Split from the popup component for the same reason content/progress.ts is
// split from the overlay: the arithmetic and the wording are what go wrong, and
// neither needs a DOM to be wrong in.

export interface PassProgress {
  model: string
  translated: number
  total: number
}

export interface PassProgressView {
  label: string
  count: string
  /** 0–1, for the bar's width. */
  fraction: number
}

/**
 * The model id, minus the part that is the same for every model you have.
 *
 * Runners namespace their ids by publisher — `qwen/qwen3.6-35b-a3b`,
 * `google/gemma-4-e4b` — which is most of the width and none of the
 * information in a popup where only one model is ever named.
 */
export function modelLabel(model: string): string {
  const tail = model.slice(model.lastIndexOf('/') + 1)
  return tail || model
}

export function passProgressView({ model, translated, total }: PassProgress): PassProgressView {
  // A track with nothing translatable in it would otherwise divide by zero and
  // render a NaN-wide bar.
  const fraction = total > 0 ? Math.min(1, translated / total) : 0
  return {
    label: `Translating with ${modelLabel(model)}`,
    count: `${translated} / ${total} lines`,
    fraction,
  }
}

export interface TranscriptProgress {
  model: string
  done: number
  total: number
  failed: number
  error?: string
  running: boolean
}

export interface TranscriptProgressView extends PassProgressView {
  /** Whether the run ended with stretches missing, and can be asked again. */
  stopped: boolean
  /** The reason, when there is one worth reading. */
  detail?: string
}

/**
 * The same shape as the pass, plus the state the pass has no equivalent of.
 *
 * A translation pass that fails leaves Chrome's on-device translation on screen;
 * a transcription that fails leaves no subtitles at all. So this one has to be
 * able to say it stopped, and how much of the episode has no lines.
 */
export function transcriptProgressView({
  model,
  done,
  total,
  failed,
  error,
  running,
}: TranscriptProgress): TranscriptProgressView {
  const fraction = total > 0 ? Math.min(1, done / total) : 0
  if (running) {
    return {
      label: `Transcribing with ${modelLabel(model)}`,
      count: total ? `${done} / ${total} chunks` : 'starting…',
      fraction,
      stopped: false,
    }
  }

  return {
    label: 'Transcription stopped',
    // Stretches rather than chunks, because what matters to the reader is how
    // much of the episode has no subtitles, not how the work was divided up.
    count: failed
      ? `${failed} stretch${failed === 1 ? '' : 'es'} missing`
      : 'nothing was transcribed',
    fraction,
    stopped: true,
    ...(error ? { detail: error } : {}),
  }
}
