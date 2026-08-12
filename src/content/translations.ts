import type { TranslatorLike } from '../lang/translate'

/**
 * The pending cue nearest at-or-after the playhead, wrapping to the lowest
 * pending index when none follow it. Null when nothing is left.
 *
 * `watchPlayback` reports -1 between cues, which needs no special case — every
 * index is ≥ -1, so the pass simply starts at the top of the track.
 */
export function pickNext(pending: Set<number>, playheadIndex: number): number | null {
  let afterPlayhead: number | null = null
  let lowest: number | null = null
  for (const index of pending) {
    if (lowest === null || index < lowest) lowest = index
    if (index >= playheadIndex && (afterPlayhead === null || index < afterPlayhead)) {
      afterPlayhead = index
    }
  }
  return afterPlayhead ?? lowest
}

export interface TranslationPassDeps {
  texts: string[]
  translator: TranslatorLike
  /** Re-read every iteration, so seeking re-prioritizes without extra machinery. */
  currentIndex: () => number
  onResult: (index: number, translated: string) => void
  signal: AbortSignal
}

/**
 * Translates an entire subtitle track in the background, nearest-the-playhead
 * first, reporting each line as it lands.
 *
 * Sequential by design: the on-device model serializes work anyway, and going
 * one at a time is what lets the playhead be re-read between cues.
 */
export async function runTranslationPass({
  texts,
  translator,
  currentIndex,
  onResult,
  signal,
}: TranslationPassDeps): Promise<void> {
  const pending = new Set<number>()
  texts.forEach((text, index) => {
    if (text.trim()) pending.add(index)
  })

  while (pending.size > 0 && !signal.aborted) {
    const index = pickNext(pending, currentIndex())
    if (index === null) break
    pending.delete(index)

    try {
      const translated = await translator.translate(texts[index])
      // Aborting mid-flight means the video changed; this result belongs to
      // the previous track and must not be painted over the new one.
      if (signal.aborted) return
      onResult(index, translated)
    } catch (e) {
      // One bad cue must not kill the pass.
      console.warn('[bb-subsgen] translation failed for cue', index, e)
    }
  }
}
