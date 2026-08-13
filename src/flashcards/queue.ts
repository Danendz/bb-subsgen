// What to review right now, and how much new material to let through.
//
// Pure, so the rationing rules can be tested directly — they are what decide
// whether the deck stays usable after a month of watching.

import { graduationOrder } from './capture'
import { startOfDay } from './scheduler'
import type { Item } from './types'

export interface QueueLimits {
  newWordsPerDay: number
  newSentencesPerDay: number
}

export interface QueueInput extends QueueLimits {
  items: Item[]
  now: number
  /** Unknown words in a pooled sentence — what orders the intake. */
  unknownCount: (item: Item) => number
  /**
   * Frequency rank, looked up rather than stored on the card.
   *
   * A word list is uploaded whenever the user gets round to it, typically long
   * after words have been collected. A rank denormalised at discovery would be
   * missing on every card that predates the upload — which is all of them —
   * so ordering would silently not improve. Looking it up here means an upload
   * reorders the existing deck immediately, and a deletion un-does it.
   */
  rankOf: (headword: string) => number | undefined
}

/** Cards waiting because they came due, oldest first. */
function due(items: Item[], now: number): Item[] {
  return items
    .filter(
      (item) => (item.state === 'learning' || item.state === 'review') && item.due <= now,
    )
    .sort((a, b) => a.due - b.due)
}

function introducedToday(items: Item[], now: number, kind: Item['kind']): number {
  const midnight = startOfDay(now)
  return items.filter(
    (item) => item.kind === kind && item.introducedAt !== undefined && item.introducedAt >= midnight,
  ).length
}

/**
 * New words waiting to be introduced, most frequent first.
 *
 * Frequency order is what keeps effort proportional to payoff: the deck grows
 * by whatever you happened to look up, but the order you actually meet those
 * words in is how much they are worth knowing. Unranked words sort last —
 * absence from a frequency list is evidence of rarity, not of importance.
 */
function newWords(
  items: Item[],
  limit: number,
  rankOf: (headword: string) => number | undefined,
): Item[] {
  if (limit <= 0) return []
  const rank = (item: Item) => rankOf(item.text) ?? Number.MAX_SAFE_INTEGER
  return items
    .filter((item) => item.kind === 'word' && item.state === 'new' && !item.introducedAt)
    // Discovery order breaks the tie, which is also the whole ordering when no
    // word list has been uploaded.
    .sort((a, b) => rank(a) - rank(b) || a.createdAt - b.createdAt)
    .slice(0, limit)
}

/**
 * Sentences waiting in the intake pool, most comprehensible first.
 *
 * This is the whole reason capture can afford to be generous. A line where you
 * know everything except one word is the most learnable thing collected; one
 * with six unknowns teaches nothing and burns a review. So the pool can hold
 * hundreds of lines from a single evening's watching and the deck still only
 * grows by the daily limit, always taking the next easiest thing in it.
 */
function newSentences(items: Item[], limit: number, unknownCount: (item: Item) => number): Item[] {
  if (limit <= 0) return []
  // No rank: a sentence is not in any frequency list, so comprehensibility is
  // the only thing ordering these.
  const pooled = items
    .filter((item) => item.kind === 'sentence' && item.state === 'pool')
    .map((item) => ({ item, unknownCount: unknownCount(item) }))

  return graduationOrder(pooled)
    .slice(0, limit)
    .map((candidate) => candidate.item)
}

/**
 * The session's cards: everything due, then whatever new material the day's
 * budget still allows.
 *
 * Due cards come first deliberately. Reviews are the debt already owed; new
 * material added ahead of them is how a deck ends up with a backlog it can
 * never clear.
 */
export function buildQueue({
  items,
  now,
  newWordsPerDay,
  newSentencesPerDay,
  unknownCount,
  rankOf,
}: QueueInput): Item[] {
  const wordBudget = newWordsPerDay - introducedToday(items, now, 'word')
  const sentenceBudget = newSentencesPerDay - introducedToday(items, now, 'sentence')

  return [
    ...due(items, now),
    ...newWords(items, wordBudget, rankOf),
    ...newSentences(items, sentenceBudget, unknownCount),
  ]
}

export interface QueueCounts {
  due: number
  newWords: number
  newSentences: number
  pooled: number
}

/** What the app shows before you start, so a session has a visible size. */
export function queueCounts(input: QueueInput): QueueCounts {
  const { items, now, newWordsPerDay, newSentencesPerDay, unknownCount, rankOf } = input
  return {
    due: due(items, now).length,
    newWords: newWords(items, newWordsPerDay - introducedToday(items, now, 'word'), rankOf)
      .length,
    newSentences: newSentences(
      items,
      newSentencesPerDay - introducedToday(items, now, 'sentence'),
      unknownCount,
    ).length,
    pooled: items.filter((item) => item.kind === 'sentence' && item.state === 'pool').length,
  }
}
