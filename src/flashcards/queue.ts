// What to review right now, and how much new material to let through.
//
// Pure, so the rationing rules can be tested directly — they are what decide
// whether the deck stays usable after a month of watching.

import { graduationOrder } from './capture'
import { startOfDay } from './scheduler'
import type { Item, StudyInclude } from './types'

export interface QueueLimits {
  newWordsPerDay: number
  newSentencesPerDay: number
}

export interface QueueInput extends QueueLimits {
  items: Item[]
  now: number
  /** Which kinds of card this session draws from. Defaults to both. */
  include?: StudyInclude
  /**
   * Most cards to draw, counted as distinct cards.
   *
   * Applied last, after the priority order below has decided what matters most,
   * so a short session is the *top* of the queue rather than a sample of it.
   * Absent means no cap, which is what every caller did before sessions had a
   * size.
   */
  limit?: number
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

/**
 * The cards this session is allowed to touch.
 *
 * Applied before anything else, so the daily budgets and the priority order are
 * all computed against the same restricted deck. Filtering by kind cannot
 * disturb the budgets, which are counted per kind anyway: studying only words
 * today leaves tomorrow's sentence intake exactly where it was.
 */
function included(items: Item[], include: StudyInclude): Item[] {
  if (include === 'both') return items
  const kind = include === 'words' ? 'word' : 'sentence'
  return items.filter((item) => item.kind === kind)
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
  include = 'both',
  limit,
}: QueueInput): Item[] {
  const pool = included(items, include)
  const wordBudget = newWordsPerDay - introducedToday(pool, now, 'word')
  const sentenceBudget = newSentencesPerDay - introducedToday(pool, now, 'sentence')

  const queue = [
    ...due(pool, now),
    ...newWords(pool, wordBudget, rankOf),
    ...newSentences(pool, sentenceBudget, unknownCount),
  ]

  return limit === undefined ? queue : queue.slice(0, Math.max(0, limit))
}

export interface QueueCounts {
  due: number
  newWords: number
  newSentences: number
  pooled: number
}

/**
 * What the app shows before you start, so a session has a visible size.
 *
 * Deliberately ignores `limit`: these are what is *available*, and the start
 * screen needs both numbers to say "42 waiting, studying 20". Applying the cap
 * here would make the shortfall invisible, which is the one thing about a
 * backlog worth knowing.
 */
export function queueCounts(input: QueueInput): QueueCounts {
  const { now, newWordsPerDay, newSentencesPerDay, unknownCount, rankOf } = input
  const items = included(input.items, input.include ?? 'both')
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
