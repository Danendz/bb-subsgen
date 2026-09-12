// One question's worth of options.
//
// Given the answer and a pool of wrong ones, this assembles the set the learner
// actually sees. It works on the rendered strings rather than on headwords
// because that is the only level at which the rule it exists to enforce can be
// checked: two different words can share a gloss — 高兴 and 快乐 are both
// "happy" — and offering both makes two options correct, which is the same
// hazard `buildBank` drops duplicate tiles for.
//
// Pure, and split from `distractors.ts`: that module answers which *words*, and
// sentence tiles want that answer without wanting an option set.

import { shuffle } from './wordbank'

/** Four is enough to make a guess cost something without turning the card into reading. */
export const OPTION_COUNT = 4

export interface Choice {
  text: string
  correct: boolean
}

/**
 * The options for one card, shuffled.
 *
 * `distractors` is a pool rather than a list of exactly the wrong answers: the
 * first few distinct ones are taken and the rest are spare, because a candidate
 * can drop out for colliding with the answer or with another candidate and a
 * caller that supplied exactly three would silently ask a three-option
 * question.
 *
 * Seeded through the same shuffle the tile bank uses, for the same reason —
 * options rearranging under the user's finger mid-answer reads as a bug — and
 * `seedFor` reshuffles them between sittings.
 *
 * An empty answer returns no options at all. A word the dictionary cannot gloss
 * has no correct option to offer, and an option set with nothing right in it is
 * worse than not asking.
 */
export function buildChoices(
  answer: string,
  distractors: readonly string[],
  seed: number,
): Choice[] {
  if (!answer) return []

  const taken = new Set([answer])
  const wrong: string[] = []
  for (const text of distractors) {
    if (!text || taken.has(text)) continue
    taken.add(text)
    wrong.push(text)
    if (wrong.length === OPTION_COUNT - 1) break
  }

  return shuffle(
    [{ text: answer, correct: true }, ...wrong.map((text) => ({ text, correct: false }))],
    seed,
  )
}
