// What to review right now, and how much new material to let through.
//
// Pure, so the rationing rules can be tested directly — they are what decide
// whether the deck stays usable after a month of watching.

import { graduationOrder } from './capture'
import { DAY_MS, startOfDay } from './scheduler'
import type { Item, StudyInclude } from './types'

export interface QueueLimits {
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
   * number frozen at the moment of collection. It is the one signal always
   * available — a frequency list has to be uploaded, but how often you have
   * actually met a word is collected from the first video you watch.
   */
  seenCount?: (headword: string) => number
}

/**
 * The cards this session is allowed to touch.
 *
 * Applied before anything else, so the line budget and the priority order are
 * both computed against the same restricted deck. Filtering by kind cannot
 * disturb that budget: studying only words today leaves tomorrow's line intake
 * exactly where it was.
 */
const INCLUDED_KIND: Record<Exclude<StudyInclude, 'both'>, Item['kind']> = {
  words: 'word',
  sentences: 'sentence',
  grammar: 'grammar',
}

function included(items: Item[], include: StudyInclude): Item[] {
  if (include === 'both') return items
  const kind = INCLUDED_KIND[include]
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
 * Words collected but never yet studied, in the order they are worth meeting.
 *
 * Unrationed. Every word is a candidate from the moment it is collected, and the
 * session size is the only thing that decides how many are actually met — so
 * this returns the whole ordered run and lets `buildSession` take the top of it.
 *
 * Frequency leads, because it keeps effort proportional to payoff: the deck
 * grows by whatever happened to cross your screen, but how often a word is used
 * is how much it is worth knowing. Unranked words sort last — absence from a
 * frequency list is evidence of rarity, not of importance.
 *
 * Exposure count breaks the tie, which quietly makes it the *whole* ordering
 * until a word list is uploaded: with no ranks, every word ties on the first key
 * and falls through to this one. That matters because a frequency list is
 * optional and often late, while how many times you have actually met a word is
 * collected from the first video you watch — and for this particular learner it
 * is the better evidence anyway.
 */
function newWords(
  items: Item[],
  limit: number,
  rankOf: (headword: string) => number | undefined,
  seenCount: (headword: string) => number,
): Item[] {
  if (limit <= 0) return []
  const rank = (item: Item) => rankOf(item.text) ?? Number.MAX_SAFE_INTEGER

  return items
    // Both halves are load-bearing. `state` excludes anything already started or
    // declared known; `introducedAt` is the belt to that braces, since it is the
    // field the rest of the queue treats as the record of a first review.
    .filter((item) => item.kind === 'word' && item.state === 'new' && !item.introducedAt)
    .sort(
      (a, b) =>
        rank(a) - rank(b) ||
        seenCount(b.text) - seenCount(a.text) ||
        a.createdAt - b.createdAt,
    )
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
 * Patterns waiting to be met, most-sighted first.
 *
 * Ordered by how often you have actually run into the structure, which is the
 * same argument that orders the word pool by sightings: the grammar worth
 * learning next is the grammar that keeps stopping you.
 *
 * Budgeted against the same daily allowance as lines rather than released on
 * sight like words. A pattern is a slower thing to learn than a word, and an
 * evening's watching can turn up a dozen — letting them all in would swamp a
 * session with structures you met once each.
 */
function newGrammar(items: Item[], limit: number): Item[] {
  if (limit <= 0) return []
  return items
    .filter((item) => item.kind === 'grammar' && item.state === 'pool')
    .sort((a, b) => b.contexts.length - a.contexts.length || a.createdAt - b.createdAt)
    .slice(0, limit)
}

/**
 * Cards already in the deck that are not due yet — the practice material.
 *
 * This is what makes a session possible on a day when everything collected has
 * been met and nothing has come round: a deck of several hundred cards that
 * cannot be opened is how the habit stops, and the streak goes with it.
 *
 * What is left out matters as much as what is in. The line pool and unmet new
 * cards are excluded so the daily budget stays the only door lines come in
 * through — `applyReviewIn` sets `introducedAt` on first review, so drilling a
 * pooled line and failing it would quietly spend a slot of the day's intake.
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
 * The session's cards: everything due, then today's lines, then new words, then
 * practice to fill out whatever is left.
 *
 * Due cards come first deliberately. Reviews are the debt already owed; new
 * material added ahead of them is how a deck ends up with a backlog it can
 * never clear. Practice comes last for the same reason from the other end — it
 * is the only source with nothing at stake, so it takes what the scheduled
 * sources leave and never displaces them.
 *
 * New lines come *before* new words even though both are new. Lines are still
 * rationed to a handful a day while words are not, so the other order would let
 * a deck holding hundreds of uncollected words push every line past `limit` and
 * silently stop sentence intake altogether.
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
  newSentencesPerDay,
  unknownCount,
  rankOf,
  seenCount = () => 0,
  include = 'both',
  limit,
}: QueueInput): QueueSession {
  const pool = included(items, include)
  const sentenceBudget = newSentencesPerDay - introducedToday(pool, now, 'sentence')
  // Its own budget, not a share of the line budget: studying only grammar today
  // should not consume tomorrow's lines, and the two pools graduate on
  // different grounds.
  const grammarBudget = newSentencesPerDay - introducedToday(pool, now, 'grammar')

  // Words are capped by the session rather than by the day, so an uncapped
  // caller asking "what is owed" gets the whole run — which is the honest
  // answer now that nothing is holding them back.
  const wordLimit = limit ?? Number.MAX_SAFE_INTEGER

  const scheduled = [
    ...due(pool, now),
    ...newSentences(pool, sentenceBudget, unknownCount),
    ...newGrammar(pool, grammarBudget),
    ...newWords(pool, wordLimit, rankOf, seenCount),
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
  /** Words collected but never studied. No longer rationed, so this can be large. */
  newWords: number
  newSentences: number
  /** Grammar patterns the day's budget still has room for. */
  newGrammar: number
  /** Lines and patterns still waiting in the intake pool. Words no longer have one. */
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
  const { now, newSentencesPerDay, unknownCount, rankOf } = input
  const seenCount = input.seenCount ?? (() => 0)
  const items = included(input.items, input.include ?? 'both')
  return {
    due: due(items, now).length,
    newWords: newWords(items, Number.MAX_SAFE_INTEGER, rankOf, seenCount).length,
    newSentences: newSentences(
      items,
      newSentencesPerDay - introducedToday(items, now, 'sentence'),
      unknownCount,
    ).length,
    newGrammar: newGrammar(items, newSentencesPerDay - introducedToday(items, now, 'grammar'))
      .length,
    pooled: items.filter(
      (item) =>
        (item.kind === 'sentence' || item.kind === 'grammar') && item.state === 'pool',
    ).length,
    // Uncapped, like everything else here: this is the size of the eligible set,
    // which is what tells the screen whether a session can be offered at all.
    practice: items.filter((item) => practisable(item, now)).length,
  }
}
