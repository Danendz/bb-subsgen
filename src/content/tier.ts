// Which of the two translations a line shows.
//
// Chrome's on-device translator paints immediately and is always running. The
// local model runs behind it and is better, but a full track is tens of minutes
// of generation. So both exist at once, and this decides what is on screen.
//
// Two rules, and the first matters more than it sounds.
//
// Freeze-on-display: once a line has shown a translation, that translation is
// what it shows for as long as it is up. Without this, a batch landing while
// you are halfway through reading a line silently rewrites it under you — which
// is a worse experience than never upgrading the line at all.
//
// The buffer gate: prefer the model's output only once enough of the track
// ahead of the playhead has it. Line-by-line preference would alternate between
// two translators with different registers, which reads worse than either one
// alone.

/**
 * How many cues ahead must be translated before the model's output is used.
 *
 * Two batches. One is not enough — a single batch is consumed in under a minute
 * of playback, and the display would flip back to the on-device translator
 * almost immediately.
 */
export const BUFFER_CUES = 50

export interface Tiers {
  /** Chrome's on-device translation, if it has arrived. */
  nmt: string | undefined
  /** The local model's, if it has arrived. */
  llm: string | undefined
  /** Whether the buffer gate has opened. */
  latched: boolean
}

/** Which of the two translators produced the text on screen. */
export type Source = 'nmt' | 'llm'

export interface Shown {
  text: string
  /** Null when there is no text yet — nothing to attribute. */
  source: Source | null
}

/**
 * The translation to show for a line that has not shown one yet, and which
 * translator it came from.
 *
 * Before the gate opens the on-device translation wins, because mixing the two
 * registers line by line reads worse than either. After it opens the model's
 * wins where it exists. Either way something available beats nothing: a line
 * with only one of the two shows that one.
 *
 * The source rides along rather than being recoverable afterwards: the two
 * translators can and do land on the same sentence, so comparing the displayed
 * string against both caches would attribute those lines by coin flip.
 */
export function preferred({ nmt, llm, latched }: Tiers): Shown {
  const [first, second]: Array<[Source, string | undefined]> = latched
    ? [
        ['llm', llm],
        ['nmt', nmt],
      ]
    : [
        ['nmt', nmt],
        ['llm', llm],
      ]
  const [source, text] = first[1] !== undefined ? first : second
  // A tier that arrived blank is still nothing to read, so it is nothing to
  // attribute either.
  return text ? { text, source } : { text: '', source: null }
}

/**
 * The translation to freeze onto a card, which is not the one on screen.
 *
 * `preferred` answers "what should this line show", and its gate exists so that
 * consecutive lines don't alternate between two translators with different
 * registers. A card has no neighbours: it is one line, read alone, weeks later,
 * with nothing to clash with. So the reason for the gate does not survive the
 * trip, and the better translation wins whenever it exists — including in the
 * opening minutes of a video, where the model has covered the line but has not
 * yet built the buffer that would put it on screen.
 */
export function forCard({ nmt, llm }: Pick<Tiers, 'nmt' | 'llm'>): string {
  return llm ?? nmt ?? ''
}

/**
 * How many cues from `from` onward have a model translation, unbroken.
 *
 * Contiguous rather than counted: fifty translated lines scattered through the
 * next thousand are not a buffer, and would open the gate on a track that then
 * falls straight back to the on-device translator.
 *
 * Blank cues never get translated and would otherwise break every run, so
 * `translatable` reports which indices were ever going to be filled.
 */
export function bufferedAhead(
  from: number,
  total: number,
  hasLlm: (index: number) => boolean,
  translatable: (index: number) => boolean,
): number {
  let run = 0
  for (let index = Math.max(0, from); index < total; index += 1) {
    if (!translatable(index)) continue
    if (!hasLlm(index)) break
    run += 1
  }
  return run
}

/**
 * Whether the gate is open, given how much is buffered.
 *
 * Sticky. Once the model's output has been good enough to switch to, seeking
 * into a stretch it has not reached yet falls back per line — it does not
 * put the whole track back on the on-device translator and make you earn the
 * switch a second time.
 */
export function latch(current: boolean, buffered: number, threshold = BUFFER_CUES): boolean {
  return current || buffered >= threshold
}
