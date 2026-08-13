import { describe, expect, test } from 'vitest'
import { DAY_MS, LADDER, MAX_LEVEL, levelOf, schedule, startOfDay } from './scheduler'

const fresh = { interval: 0, level: 0, ease: 2.5, reps: 0, lapses: 0 }
const NOW = Date.UTC(2026, 7, 12, 12, 0, 0)

/** Applies a run of grades, the way a session actually would. */
function run(start: typeof fresh, grades: Array<'again' | 'good'>) {
  let item = { ...start, ...schedule(start, grades[0], NOW) }
  for (const grade of grades.slice(1)) item = { ...item, ...schedule(item, grade, NOW) }
  return item
}

describe('schedule', () => {
  test('a new card answered right comes back tomorrow', () => {
    const next = schedule(fresh, 'good', NOW)
    expect(next.level).toBe(1)
    expect(next.interval).toBe(1)
    expect(next.due).toBe(NOW + DAY_MS)
    expect(next.state).toBe('review')
  })

  test('right answers walk up the ladder one rung at a time', () => {
    const intervals: number[] = []
    let item = fresh
    for (let i = 0; i < MAX_LEVEL; i++) {
      item = { ...item, ...schedule(item, 'good', NOW) }
      intervals.push(item.interval)
    }
    expect(intervals).toEqual([1, 3, 7, 16, 35, 90])
  })

  test('the ladder caps rather than growing forever', () => {
    const topped = run(fresh, Array(20).fill('good'))
    expect(topped.level).toBe(MAX_LEVEL)
    expect(topped.interval).toBe(LADDER[MAX_LEVEL])
  })

  test('a wrong answer keeps the card in the session instead of burying it', () => {
    // Forgetting something and then not seeing it for two weeks is how a deck
    // quietly stops teaching.
    const mature = run(fresh, ['good', 'good', 'good', 'good', 'good'])
    expect(mature.level).toBe(5)

    const lapsed = schedule(mature, 'again', NOW)
    expect(lapsed.due).toBeGreaterThan(NOW)
    expect(lapsed.due).toBeLessThan(NOW + DAY_MS)
    expect(lapsed.state).toBe('learning')
    expect(lapsed.lapses).toBe(1)
  })

  test('a wrong answer costs one rung, not the whole ladder', () => {
    const mature = run(fresh, Array(5).fill('good'))
    expect(schedule(mature, 'again', NOW).level).toBe(mature.level - 1)
  })

  test('getting a new card wrong never promotes it', () => {
    // The demotion floors at 0 rather than at the first day-rung. Flooring at 1
    // would schedule a card you just failed for tomorrow.
    const next = schedule(fresh, 'again', NOW)
    expect(next.level).toBe(0)
    expect(next.due).toBeLessThan(NOW + DAY_MS)
    expect(next.state).toBe('learning')
  })

  test('a lapsed card climbs back to where it was', () => {
    const mature = run(fresh, Array(5).fill('good'))
    const recovered = run(mature, ['again', 'good'])
    expect(recovered.level).toBe(mature.level)
    expect(recovered.interval).toBe(mature.interval)
    expect(recovered.state).toBe('review')
  })

  test('level and interval never disagree', () => {
    let item = fresh
    for (const grade of ['good', 'good', 'again', 'good', 'again', 'again', 'good'] as const) {
      item = { ...item, ...schedule(item, grade, NOW) }
      expect(item.interval).toBe(LADDER[item.level])
    }
  })

  test('reps count every asking, so the mixed-mode rotation keeps moving', () => {
    // Resetting reps on a lapse would pin a difficult card to one question style
    // forever — exactly the card that most needs meeting from another angle.
    const item = run(fresh, ['good', 'again', 'good', 'again'])
    expect(item.reps).toBe(4)
    expect(item.lapses).toBe(2)
  })

  test('lapses accumulate and survive later successes', () => {
    const item = run(fresh, ['good', 'good', 'again', 'good', 'good'])
    expect(item.lapses).toBe(1)
  })

  test('crossing into known is a rung, not a coincidence', () => {
    // MATURE_INTERVAL_DAYS is 21; L5 is the first rung to clear it.
    expect(LADDER.findIndex((days) => days >= 21)).toBe(5)
  })

  describe('grades from the four-button era, met during replay', () => {
    test('hard holds position rather than inventing a rung', () => {
      const item = run(fresh, ['good', 'good'])
      const next = schedule(item, 'hard', NOW)
      expect(next.level).toBe(item.level)
      expect(next.state).toBe('review')
    })

    test('easy climbs, same as good', () => {
      const item = run(fresh, ['good', 'good'])
      expect(schedule(item, 'easy', NOW).level).toBe(item.level + 1)
    })
  })
})

describe('levelOf', () => {
  test('a stored level wins', () => {
    expect(levelOf({ interval: 90, level: 2 })).toBe(2)
  })

  test('a card written before the ladder lands on its nearest rung', () => {
    // The whole migration: nothing is rewritten, the level is derived from the
    // interval the card already earned.
    expect(levelOf({ interval: 0 })).toBe(0)
    expect(levelOf({ interval: 1 })).toBe(1)
    expect(levelOf({ interval: 30 })).toBe(5)
    expect(levelOf({ interval: 200 })).toBe(6)
  })

  test('nearest, not the rung below', () => {
    // 30 days is closer to 35 than to 16, so an SM-2 card that had all but
    // reached maturity is not demoted for sitting between rungs.
    expect(Math.abs(LADDER[5] - 30)).toBeLessThan(Math.abs(LADDER[4] - 30))
    expect(levelOf({ interval: 30 })).toBe(5)
  })

  test('a stored level is clamped to the ladder', () => {
    expect(levelOf({ interval: 0, level: 99 })).toBe(MAX_LEVEL)
    expect(levelOf({ interval: 0, level: -3 })).toBe(0)
  })
})

describe('startOfDay', () => {
  test('is local midnight, not UTC', () => {
    const midnight = startOfDay(NOW)
    const date = new Date(midnight)
    expect(date.getHours()).toBe(0)
    expect(date.getMinutes()).toBe(0)
    expect(midnight).toBeLessThanOrEqual(NOW)
  })

  test('two times on the same local day agree', () => {
    const morning = new Date(NOW)
    morning.setHours(7, 30, 0, 0)
    const evening = new Date(NOW)
    evening.setHours(22, 45, 0, 0)
    expect(startOfDay(morning.getTime())).toBe(startOfDay(evening.getTime()))
  })
})
