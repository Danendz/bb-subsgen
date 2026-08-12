// SM-2, at day granularity.
//
// The algorithm is not the load-bearing decision here — storing the full review
// log is (see `Review` in types.ts). Because every review is kept with its
// grade, style and timestamp, this scheduler can be replaced with FSRS or
// anything else by replaying the log, with no migration and no lost history.
// That is also what makes importing another browser's export a merge rather
// than an overwrite.

import type { Grade, Item, ItemState } from './types'

export const DAY_MS = 86_400_000

/** Ease bounds. Below ~1.3 intervals stop growing and a card becomes a treadmill. */
const MIN_EASE = 1.3
const MAX_EASE = 2.8

/** A lapsed card comes back in the same session, but not as the very next card. */
const RELEARN_MS = 60_000

export interface Schedule {
  interval: number
  ease: number
  due: number
  reps: number
  lapses: number
  state: ItemState
}

function clampEase(ease: number): number {
  return Math.min(MAX_EASE, Math.max(MIN_EASE, ease))
}

/**
 * The next schedule for an item, given how the review went.
 *
 * `again` resets progress but keeps the card in the day: forgetting something
 * and not seeing it again for a week is how a deck quietly stops teaching.
 * Everything else grows the interval, `good` on the classic 1 / 6 / ×ease
 * progression.
 */
export function schedule(
  item: Pick<Item, 'interval' | 'ease' | 'reps' | 'lapses'>,
  grade: Grade,
  now: number,
): Schedule {
  const { interval, ease, reps, lapses } = item

  if (grade === 'again') {
    return {
      interval: 0,
      ease: clampEase(ease - 0.2),
      due: now + RELEARN_MS,
      reps: 0,
      lapses: lapses + 1,
      state: 'learning',
    }
  }

  let next: number
  let nextEase = ease

  if (grade === 'hard') {
    // Grows, but slower than ease would — and never stalls at the same
    // interval, which would make "hard" indistinguishable from "again".
    next = reps === 0 ? 1 : Math.max(interval + 1, Math.round(interval * 1.2))
    nextEase = clampEase(ease - 0.15)
  } else if (grade === 'good') {
    next = reps === 0 ? 1 : reps === 1 ? 6 : Math.round(interval * ease)
  } else {
    nextEase = clampEase(ease + 0.15)
    next = reps === 0 ? 4 : reps === 1 ? 10 : Math.round(interval * ease * 1.3)
  }

  // Guards the reps 0→1 steps too: without it a `good` after a lapse could
  // schedule the same interval twice running.
  next = Math.max(1, next)

  return {
    interval: next,
    ease: nextEase,
    due: now + next * DAY_MS,
    reps: reps + 1,
    lapses,
    state: 'review',
  }
}

/** Local midnight, so "introduced today" means the day you are actually having. */
export function startOfDay(now: number): number {
  const date = new Date(now)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}
