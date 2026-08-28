// Where the two translations of a track are kept, per target language.
//
// `tier.ts` is the rules — which of the two a line shows, when the gate opens —
// and holds nothing. This is the store those rules run against, and the only
// stateful piece taken out of the overlay orchestrator. It imports `tier.ts` and
// deliberately does not absorb it: the rules are worth reading without the
// bookkeeping around them.
//
// What it is not is a translator. Nothing here starts a pass, and nothing here
// knows about cues — see `latchOn`.

import { forCard, latch, preferred, type Shown } from './tier'
import type { TranslationLang } from '../shared/settings'

/** One line as the worker reports it, keyed the way everything in here is. */
export interface TranslatedLine {
  start: number
  text: string
}

export interface Lanes {
  /** Files one on-device result. */
  nmt(lang: TranslationLang, start: number, text: string): void
  /** Files one batch from the model. */
  llm(lang: TranslationLang, lines: readonly TranslatedLine[]): void
  /** What this line should show, and which translator it came from. */
  shown(lang: TranslationLang, start: number): Shown
  /** What this line should freeze onto a card, which is not what it shows. */
  card(lang: TranslationLang, start: number): string
  hasNmt(lang: TranslationLang, start: number): boolean
  hasLlm(lang: TranslationLang, start: number): boolean
  countNmt(lang: TranslationLang): number
  countLlm(lang: TranslationLang): number
  /**
   * Opens the buffer gate if `buffered` is enough, and says whether this was the
   * call that opened it.
   *
   * The caller needs that answer: opening the gate changes which tier wins for
   * the line already on screen, whose model translation may have arrived batches
   * ago and been passed over every time.
   *
   * Takes the count rather than working it out. Counting means walking the cue
   * list, which is renumbered underneath this as chunks land — so the caller,
   * which owns that array, does the walk and hands over a number.
   */
  latchOn(lang: TranslationLang, buffered: number): boolean
  /** Forgets everything. A new video, never a new overlay. */
  clear(): void
}

/**
 * The two caches and the gate, for the life of the page.
 *
 * Per target language, each inner map keyed by the cue's **start**.
 *
 * Not by its index in the array, which is where these all began. A transcript
 * arrives in pieces and playhead-first, so a chunk landing early in the track
 * shifts every index after it — and an index-keyed translation would then be
 * painted under a different line than the one it was written for. Start is the
 * identity `llm-cache` and `Context` already use, for the same reason.
 *
 * Keeping a lane per language means switching back to one already translated
 * renders instantly instead of re-running the pass. It also means `lang` is a
 * parameter on every call here and is never held: a result arriving after the
 * user switches language belongs to the language the pass was started for, and a
 * remembered "current" language would file it under the wrong one in silence.
 */
export function createLanes(): Lanes {
  const nmtLanes = new Map<TranslationLang, Map<number, string>>()
  const llmLanes = new Map<TranslationLang, Map<number, string>>()
  /** Languages whose model output is now buffered far enough ahead to prefer. */
  const latched = new Set<TranslationLang>()

  const laneFor = (
    lanes: Map<TranslationLang, Map<number, string>>,
    lang: TranslationLang,
  ): Map<number, string> => {
    let lane = lanes.get(lang)
    if (!lane) {
      lane = new Map()
      lanes.set(lang, lane)
    }
    return lane
  }

  return {
    nmt: (lang, start, text) => void laneFor(nmtLanes, lang).set(start, text),

    llm: (lang, lines) => {
      const lane = laneFor(llmLanes, lang)
      for (const line of lines) lane.set(line.start, line.text)
    },

    shown: (lang, start) =>
      preferred({
        nmt: laneFor(nmtLanes, lang).get(start),
        llm: laneFor(llmLanes, lang).get(start),
        latched: latched.has(lang),
      }),

    card: (lang, start) =>
      forCard({
        nmt: laneFor(nmtLanes, lang).get(start),
        llm: laneFor(llmLanes, lang).get(start),
      }),

    hasNmt: (lang, start) => laneFor(nmtLanes, lang).has(start),
    hasLlm: (lang, start) => laneFor(llmLanes, lang).has(start),
    countNmt: (lang) => laneFor(nmtLanes, lang).size,
    countLlm: (lang) => laneFor(llmLanes, lang).size,

    latchOn: (lang, buffered) => {
      if (latched.has(lang)) return false
      const opened = latch(false, buffered)
      if (opened) latched.add(lang)
      return opened
    },

    clear: () => {
      nmtLanes.clear()
      llmLanes.clear()
      latched.clear()
    },
  }
}
