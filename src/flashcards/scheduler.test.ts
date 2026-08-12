import { describe, expect, test } from 'vitest'
import { DAY_MS, schedule, startOfDay } from './scheduler'

const fresh = { interval: 0, ease: 2.5, reps: 0, lapses: 0 }
const NOW = Date.UTC(2026, 7, 12, 12, 0, 0)

describe('schedule', () => {
  test('a new card answered well comes back tomorrow', () => {
    const next = schedule(fresh, 'good', NOW)
    expect(next.interval).toBe(1)
    expect(next.due).toBe(NOW + DAY_MS)
    expect(next.state).toBe('review')
    expect(next.reps).toBe(1)
  })

  test('the second and third good answers follow 1 / 6 / x ease', () => {
    const first = schedule(fresh, 'good', NOW)
    const second = schedule(first, 'good', NOW)
    const third = schedule(second, 'good', NOW)

    expect([first.interval, second.interval, third.interval]).toEqual([1, 6, 15])
  })

  test('again keeps the card in the session instead of burying it', () => {
    // Forgetting something and then not seeing it for a week is how a deck
    // quietly stops teaching.
    const mature = { interval: 40, ease: 2.5, reps: 6, lapses: 0 }
    const next = schedule(mature, 'again', NOW)

    expect(next.interval).toBe(0)
    expect(next.due).toBeGreaterThan(NOW)
    expect(next.due).toBeLessThan(NOW + DAY_MS)
    expect(next.state).toBe('learning')
    expect(next.lapses).toBe(1)
    expect(next.reps).toBe(0)
  })

  test('again lowers ease and easy raises it', () => {
    expect(schedule(fresh, 'again', NOW).ease).toBeCloseTo(2.3)
    expect(schedule(fresh, 'hard', NOW).ease).toBeCloseTo(2.35)
    expect(schedule(fresh, 'good', NOW).ease).toBeCloseTo(2.5)
    expect(schedule(fresh, 'easy', NOW).ease).toBeCloseTo(2.65)
  })

  test('ease is clamped, so a card can never become a treadmill', () => {
    // Below ~1.3 intervals stop growing meaningfully and the card returns
    // forever at the same spacing.
    let item = { interval: 10, ease: 1.4, reps: 5, lapses: 0 }
    for (let i = 0; i < 5; i++) item = { ...item, ...schedule(item, 'again', NOW) }
    expect(item.ease).toBe(1.3)

    let easy = { interval: 10, ease: 2.7, reps: 5, lapses: 0 }
    for (let i = 0; i < 5; i++) easy = { ...easy, ...schedule(easy, 'easy', NOW) }
    expect(easy.ease).toBe(2.8)
  })

  test('hard always moves forward, so it stays distinct from again', () => {
    // A "hard" that returned the same interval would be indistinguishable from
    // forgetting, and the card would never leave the low intervals.
    const item = { interval: 3, ease: 1.3, reps: 4, lapses: 0 }
    expect(schedule(item, 'hard', NOW).interval).toBeGreaterThan(item.interval)
  })

  test('easy outruns good from the same position', () => {
    const item = { interval: 10, ease: 2.5, reps: 4, lapses: 0 }
    expect(schedule(item, 'easy', NOW).interval).toBeGreaterThan(
      schedule(item, 'good', NOW).interval,
    )
  })

  test('every grade but again schedules at least a day out', () => {
    const lapsed = { interval: 0, ease: 1.3, reps: 0, lapses: 3 }
    for (const grade of ['hard', 'good', 'easy'] as const) {
      expect(schedule(lapsed, grade, NOW).interval).toBeGreaterThanOrEqual(1)
    }
  })

  test('lapses accumulate and survive later successes', () => {
    const first = schedule({ interval: 20, ease: 2.5, reps: 5, lapses: 2 }, 'again', NOW)
    expect(first.lapses).toBe(3)
    expect(schedule(first, 'good', NOW).lapses).toBe(3)
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
