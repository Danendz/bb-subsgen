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
