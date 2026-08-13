// A mastery ladder, at day granularity.
//
// The review screen asks one question — did you get it or not — so the
// scheduler's entire state is a position on a ladder rather than an ease factor
// tuned by four grades. Right is one rung up, wrong is one rung down. That makes
// the level itself the card's mastery, which is why it can be put on screen
// without translating anything: "4 of 6" is the state, not a rendering of it.
//
// The algorithm is still not the load-bearing decision — storing the full review
// log is (see `Review` in types.ts). Every review is kept with its grade, style
// and timestamp, so this can be replaced by replaying the log, with no migration
// and no lost history. That is also what makes importing another browser's
// export a merge rather than an overwrite.

import type { Grade, Item, ItemState } from './types'

export const DAY_MS = 86_400_000

/**
 * Days at each rung.
 *
 * L0 is the relearning rung and is measured in minutes rather than days, so it
 * sits at 0 here and is scheduled by `RELEARN_MS` instead. The upper rungs are
 * sized so L5 is the first to clear `MATURE_INTERVAL_DAYS` (21) — reaching it is
 * exactly what makes a word known and stops the overlay annotating it, so the
 * ladder and the known rule cannot drift apart.
 */
export const LADDER: readonly number[] = [0, 1, 3, 7, 16, 35, 90]

export const MAX_LEVEL = LADDER.length - 1

/** A lapsed card comes back in the same session, but not as the very next card. */
const RELEARN_MS = 600_000

export interface Schedule {
  level: number
  interval: number
  ease: number
  due: number
  reps: number
  lapses: number
  state: ItemState
}

/**
 * Where a card sits on the ladder.
 *
 * Cards written before the ladder existed carry an SM-2 interval and no level,
 * so their level is derived from the interval they already earned — the nearest
 * rung, not the one below, so a card at 30 days lands on L5 (35) rather than
 * being demoted to L4 (16) for being between rungs. Deriving on read is what
 * makes this a migration with no migration: nothing is rewritten, and the
 * derived level is persisted the next time the card is reviewed.
 */
export function levelOf(item: Pick<Item, 'interval' | 'level'>): number {
  if (item.level !== undefined) {
    return Math.min(MAX_LEVEL, Math.max(0, Math.round(item.level)))
  }

  let best = 0
  for (let rung = 1; rung <= MAX_LEVEL; rung++) {
    if (Math.abs(LADDER[rung] - item.interval) < Math.abs(LADDER[best] - item.interval)) {
      best = rung
    }
  }
  return best
}

/**
 * How a grade moves a card.
 *
 * The screen only ever sends `again` or `good`. The other two exist because the
 * log still holds rows from the four-button era, and replaying that history has
 * to mean something: `hard` holds position rather than inventing a rung the user
 * never earned.
 */
function step(grade: Grade): -1 | 0 | 1 {
  if (grade === 'again') return -1
  if (grade === 'hard') return 0
  return 1
}

/**
 * The next schedule for an item, given how the review went.
 *
 * A wrong answer always brings the card back inside the sitting, whatever rung
 * it fell from: forgetting something and then not seeing it for two weeks is how
 * a deck quietly stops teaching. It also costs one rung rather than resetting to
 * the bottom — forgetting once is weak evidence that months of successful recall
 * were illusory, and with the level now visible on screen, a full reset reads as
 * punishment rather than as scheduling.
 */
export function schedule(
  item: Pick<Item, 'interval' | 'level' | 'ease' | 'reps' | 'lapses'>,
  grade: Grade,
  now: number,
): Schedule {
  const { ease, reps, lapses } = item
  const from = levelOf(item)
  const wrong = grade === 'again'

  // Floored at 0, not at 1. Flooring a lapse at the first day-rung would promote
  // a brand-new card for getting it wrong, which is the one thing a demotion
  // must never do.
  const level = Math.min(MAX_LEVEL, Math.max(0, from + step(grade)))

  // Held at the rung's nominal spacing even while relearning, so `interval` and
  // `level` never disagree. What keeps a lapsed mature card out of the known set
  // is its state, not a zeroed interval.
  const interval = LADDER[level]

  return {
    level,
    interval,
    ease,
    due: wrong || level === 0 ? now + RELEARN_MS : now + interval * DAY_MS,
    // Monotonic: this is how many times the card has been asked, which is what
    // rotates the question style in mixed mode. Resetting it would make a card
    // that lapses meet the same style forever.
    reps: reps + 1,
    lapses: wrong ? lapses + 1 : lapses,
    state: wrong || level === 0 ? 'learning' : 'review',
  }
}

/** Local midnight, so "introduced today" means the day you are actually having. */
export function startOfDay(now: number): number {
  const date = new Date(now)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

/**
 * The local midnight before this one.
 *
 * Steps by calendar date rather than by subtracting 24 hours: the night the
 * clocks change is 23 or 25 hours long, and a streak counted in milliseconds
 * would skip or double a day twice a year.
 */
export function previousDay(midnight: number): number {
  const date = new Date(midnight)
  date.setDate(date.getDate() - 1)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}
