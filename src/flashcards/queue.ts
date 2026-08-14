// What to review right now, and how much new material to let through.
//
// Pure, so the rationing rules can be tested directly — they are what decide
// whether the deck stays usable after a month of watching.

import { graduationOrder } from './capture'
import { DAY_MS, startOfDay } from './scheduler'
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
  /**
   * Times a word has been seen on screen, looked up rather than stored.
   *
   * Same shape and same reason as `rankOf`: exposure counts live in their own
   * store and keep moving, so a copy denormalised onto the card would be a
   * number frozen at the moment of collection. This is what orders the word
   * pool, and it is the one signal always available — a frequency list has to
   * be uploaded, but how often you have actually met a word is collected from
   * the first video you watch.
   */
  seenCount?: (headword: string) => number
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
 * New words waiting to be introduced: the ones you stopped on, then the pool.
 *
 * Two lists concatenated rather than one list merged, and the order between them
 * is the point. Stopping on a word is a deliberate act and a rare one, so those
 * fill the day's budget first and the pool only ever takes what is left over.
 * That also means a deck collected before words had a pool is served in exactly
 * the order it always was — the change adds to the tail, it does not reshuffle.
 *
 * Within the deliberate half, frequency order keeps effort proportional to
 * payoff: the deck grows by whatever you happened to look up, but how often a
 * word is used is how much it is worth knowing. Unranked words sort last —
 * absence from a frequency list is evidence of rarity, not of importance.
 *
 * Within the pool, exposure count leads. The pool fills passively and can hold
 * hundreds of words after one evening, so it needs an ordering that works with
 * no word list uploaded at all; how many times a word has actually been in front
 * of you is that ordering, and it is better evidence for this particular learner
 * than a corpus rank anyway.
 */
function newWords(
  items: Item[],
  limit: number,
  rankOf: (headword: string) => number | undefined,
  seenCount: (headword: string) => number,
): Item[] {
  if (limit <= 0) return []
  const rank = (item: Item) => rankOf(item.text) ?? Number.MAX_SAFE_INTEGER
  const words = items.filter((item) => item.kind === 'word' && !item.introducedAt)

  // Discovery order breaks the tie, which is also the whole ordering when no
  // word list has been uploaded.
  const hovered = words
    .filter((item) => item.state === 'new')
    .sort((a, b) => rank(a) - rank(b) || a.createdAt - b.createdAt)

  const pooled = words
    .filter((item) => item.state === 'pool')
    .sort(
      (a, b) =>
        seenCount(b.text) - seenCount(a.text) ||
        rank(a) - rank(b) ||
        a.createdAt - b.createdAt,
    )

  return [...hovered, ...pooled].slice(0, limit)
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
 * Cards already in the deck that are not due yet — the practice material.
 *
 * This is what makes a session possible on a day when the intake budget is
 * spent and nothing has come round: a deck of several hundred collected cards
 * that cannot be opened is how the habit stops, and the streak goes with it.
 *
 * What is left out matters as much as what is in. The intake pool and unmet new
 * cards are excluded so the daily budget stays the only door material comes in
 * through — `applyReviewIn` sets `introducedAt` on first review, so drilling a
 * pooled word and failing it would quietly spend a slot of the day's intake.
 * Declared-known words are excluded to match `due` and `merge`, which already
 * treat a declaration as something scheduling does not touch.
 */
function practisable(item: Item, now: number): boolean {
  return (
    item.introducedAt !== undefined &&
    (item.state === 'learning' || item.state === 'review') &&
    // Keeps this disjoint from `due`, so nothing can be served twice.
    item.due > now
  )
}

function practice(
  items: Item[],
  now: number,
  limit: number,
  rankOf: (headword: string) => number | undefined,
): Item[] {
  if (limit <= 0) return []
  const rank = (item: Item) => rankOf(item.text) ?? Number.MAX_SAFE_INTEGER

  return items
    .filter((item) => practisable(item, now))
    .sort(
      (a, b) =>
        startOfDay(lastAnswered(a)) - startOfDay(lastAnswered(b)) ||
        rank(a) - rank(b) ||
        a.createdAt - b.createdAt,
    )
    .slice(0, limit)
}

/**
 * When a card was last answered, recovered from its schedule.
 *
 * Exact rather than approximate for everything `practice` considers: the one
 * branch of `schedule` that does not set `due = now + interval * DAY_MS` is the
 * lapse, and a lapsed card is due within ten minutes, which puts it in `due`
 * instead. So this needs no stored field and no reading of the review log.
 */
function lastAnswered(item: Item): number {
  return item.due - item.interval * DAY_MS
}

export interface QueueSession {
  cards: Item[]
  /** Ids drawn as practice, so the screen can grade and label them differently. */
  extra: Set<string>
}

/**
 * The session's cards: everything due, then whatever new material the day's
 * budget still allows, then practice to fill out the rest.
 *
 * Due cards come first deliberately. Reviews are the debt already owed; new
 * material added ahead of them is how a deck ends up with a backlog it can
 * never clear. Practice comes last for the same reason from the other end — it
 * is the only source with nothing at stake, so it takes what the scheduled
 * sources leave and never displaces them.
 *
 * Practice is drawn only when `limit` is set, because filling a session up needs
 * a size to fill up to. Callers that ask for the whole queue are asking what is
 * owed, and nothing is owed here.
 *
 * The extra ids come back as a set rather than as a count of leading scheduled
 * cards: a card answered wrong is pushed back onto the end of the queue mid
 * session, so any split by position stops being true the first time one lapses.
 */
export function buildSession({
  items,
  now,
  newWordsPerDay,
  newSentencesPerDay,
  unknownCount,
  rankOf,
  seenCount = () => 0,
  include = 'both',
  limit,
}: QueueInput): QueueSession {
  const pool = included(items, include)
  const wordBudget = newWordsPerDay - introducedToday(pool, now, 'word')
  const sentenceBudget = newSentencesPerDay - introducedToday(pool, now, 'sentence')

  const scheduled = [
    ...due(pool, now),
    ...newWords(pool, wordBudget, rankOf, seenCount),
    ...newSentences(pool, sentenceBudget, unknownCount),
  ]

  if (limit === undefined) return { cards: scheduled, extra: new Set() }

  const cards = scheduled.slice(0, Math.max(0, limit))
  const drilled = practice(pool, now, limit - cards.length, rankOf)

  return { cards: [...cards, ...drilled], extra: new Set(drilled.map((item) => item.id)) }
}

/** The session's cards alone, for callers with no use for what came from where. */
export function buildQueue(input: QueueInput): Item[] {
  return buildSession(input).cards
}

export interface QueueCounts {
  due: number
  newWords: number
  newSentences: number
  pooled: number
  /** Cards available to practise — everything in the deck that is not yet due. */
  practice: number
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
  const seenCount = input.seenCount ?? (() => 0)
  const items = included(input.items, input.include ?? 'both')
  return {
    due: due(items, now).length,
    newWords: newWords(
      items,
      newWordsPerDay - introducedToday(items, now, 'word'),
      rankOf,
      seenCount,
    ).length,
    newSentences: newSentences(
      items,
      newSentencesPerDay - introducedToday(items, now, 'sentence'),
      unknownCount,
    ).length,
    pooled: items.filter((item) => item.kind === 'sentence' && item.state === 'pool').length,
    // Uncapped, like everything else here: this is the size of the eligible set,
    // which is what tells the screen whether a session can be offered at all.
    practice: items.filter((item) => practisable(item, now)).length,
  }
}
