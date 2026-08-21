// Building a line back from its pieces.
//
// Typing a Chinese sentence through an IME is slow and punishing: a dozen
// keystrokes per word, a candidate list between you and every one of them, and
// one wrong character marking a card you actually knew. Tiles ask the same
// question — do you know the words, and do you know the order — without
// charging for the input method.

import { hanWords } from './capture'
import type { Token } from '../lang/zh/segment'

/**
 * A small deterministic PRNG.
 *
 * Seeded rather than random because the arrangement has to survive a re-render:
 * tiles rearranging themselves under the user's fingers mid-answer reads as a
 * bug, not as shuffling. It also lets the tests assert on a real arrangement
 * instead of only on set membership.
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function shuffle<T>(items: readonly T[], seed: number): T[] {
  const out = [...items]
  const random = mulberry32(seed)
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/** A stable seed per card per rep, so a card reshuffles between sittings but not within one. */
export function seedFor(id: string, reps: number): number {
  let hash = 2166136261
  for (const char of `${id}#${reps}`) {
    hash ^= char.charCodeAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

export interface Bank {
  /** The tiles, in the order that answers the card. */
  answer: string[]
  /** Every tile offered: the answer plus distractors, shuffled. */
  tiles: string[]
}

/**
 * The tiles a line breaks into.
 *
 * Punctuation is scenery rather than a tile — tapping 。into place teaches
 * nothing and doubles the length of every answer — so only the words are
 * offered, and only the words are checked.
 */
export function answerOf(tokens: Token[]): string[] {
  return hanWords(tokens)
}

/**
 * Tiles for a line, with wrong answers mixed in.
 *
 * Without distractors a four-word line can be solved by elimination alone,
 * which tests arrangement rather than recall. Any distractor that also appears
 * in the answer is dropped: two identical tiles would make the check ambiguous
 * and one of them impossible to place wrongly.
 */
export function buildBank(answer: string[], distractors: readonly string[], seed: number): Bank {
  const extra = [...new Set(distractors)].filter((word) => !answer.includes(word))
  return { answer, tiles: shuffle([...answer, ...extra], seed) }
}

/**
 * Whether the tiles placed so far spell the line.
 *
 * Compared as joined text rather than element by element, so a line that
 * segments into 我们 or into 我 + 们 is accepted either way. The user is being
 * asked for the sentence, not for the segmenter's opinion of it.
 */
export function isCorrect(placed: readonly string[], answer: readonly string[]): boolean {
  return placed.join('') === answer.join('')
}
