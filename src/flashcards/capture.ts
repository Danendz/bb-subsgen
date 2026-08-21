// What gets captured, and from what. Pure — no DOM, no database — because these
// are the rules most likely to need tuning, and tuning them by argument rather
// than by measurement is how a capture system ends up burying you.

import { isHan, type Token } from '../lang/zh/segment'
import type { LanguagePack } from '../lang/pack'

/** Longest line worth keeping as a card, matching MAX_SENTENCE_LENGTH in lang/zh/sentence.ts. */
export const MAX_LINE_LENGTH = 220

/** The dictionary words in a rendered line. Punctuation and Latin runs are not vocabulary. */
export function hanWords(tokens: Token[]): string[] {
  return tokens.map((t) => t.text).filter((text) => text.length > 0 && isHan(text[0]))
}

export function unknownIn(words: string[], known: ReadonlySet<string>): string[] {
  return words.filter((word) => !known.has(word))
}

/**
 * Whether a subtitle line is worth keeping.
 *
 * One rule, no beginner/advanced switch: a line qualifies when it contains
 * something you don't yet know. Early on that is nearly every line, which is
 * correct — you cannot pause every four seconds to curate. As the known set
 * grows the same rule quietly narrows to only the lines still worth stopping
 * for. What keeps this from flooding the deck is the intake pool, not this
 * test: capture is generous on purpose and `graduationOrder` rations it.
 */
export function shouldCaptureLine(words: string[], known: ReadonlySet<string>): boolean {
  if (!words.length) return false
  return unknownIn(words, known).length > 0
}

/** Whether a line is short enough, and enough of the studied script, to be a card at all. */
export function isCapturableText(text: string, pack: LanguagePack): boolean {
  const trimmed = text.trim()
  if (!trimmed || trimmed.length > MAX_LINE_LENGTH) return false
  return pack.containsScript(trimmed)
}

export type SelectionTarget =
  { kind: 'word'; text: string } | { kind: 'sentence'; text: string } | null

/**
 * What a reader selection should become.
 *
 * Exactly one dictionary headword is a word; anything else is a sentence. That
 * resolves the awkward middle — 选择 is a word, 我在学习 is not — without asking
 * the user to classify their own selection, and it uses the same word set that
 * already drives segmentation.
 */
export function selectionTarget(
  selected: string,
  words: Map<string, string>,
  pack: LanguagePack,
): SelectionTarget {
  const text = selected.trim()
  if (!isCapturableText(text, pack)) return null
  if (words.has(text)) return { kind: 'word', text }
  return { kind: 'sentence', text }
}

export interface Coverage {
  /** Distinct words: the "you know 87 of 112 words here" number. */
  knownTypes: number
  totalTypes: number
  /**
   * Running words, counting repeats.
   *
   * This is the one that predicts whether a video is watchable, and it is much
   * higher than the type figure because the words you know are the ones that
   * repeat. Below roughly 90% comprehension falls apart; above ~95% you can
   * follow along. Quoting a type-coverage percentage against those thresholds
   * would badly understate how followable a video is.
   */
  knownTokens: number
  totalTokens: number
}

export function coverageOf(
  counts: ReadonlyArray<{ headword: string; count: number }>,
  known: ReadonlySet<string>,
): Coverage {
  let knownTypes = 0
  let knownTokens = 0
  let totalTokens = 0

  for (const { headword, count } of counts) {
    totalTokens += count
    if (known.has(headword)) {
      knownTypes += 1
      knownTokens += count
    }
  }

  return { knownTypes, totalTypes: counts.length, knownTokens, totalTokens }
}

/** Safe against an empty video, where every fraction is 0/0. */
export function fraction(part: number, whole: number): number {
  return whole > 0 ? part / whole : 0
}

/**
 * Orders pooled candidates for introduction: fewest unknown words first.
 *
 * This is the whole reason for having a pool. A sentence where you know
 * everything except one word is the most learnable thing you have collected;
 * one with six unknowns teaches nothing and burns a review. Ties break on
 * frequency rank, so among equally-comprehensible lines the more useful
 * vocabulary comes first. Unranked items sort last rather than first — an
 * absent rank means "not in the frequency list", which is evidence of rarity,
 * not of importance.
 */
export function graduationOrder<T extends { unknownCount: number; rank?: number }>(
  candidates: T[],
): T[] {
  return [...candidates].sort(
    (a, b) =>
      a.unknownCount - b.unknownCount ||
      (a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER),
  )
}
