import { describe, expect, test } from 'vitest'
import { isKnown, MATURE_INTERVAL_DAYS } from './known'
import type { Item } from './types'

const item = (state: Item['state'], interval = 0): Pick<Item, 'state' | 'interval'> => ({
  state,
  interval,
})

describe('isKnown', () => {
  test('a word you declared known is known regardless of interval', () => {
    expect(isKnown(item('known'))).toBe(true)
  })

  test('a word reviewed to maturity is known', () => {
    expect(isKnown(item('review', MATURE_INTERVAL_DAYS))).toBe(true)
    expect(isKnown(item('review', MATURE_INTERVAL_DAYS + 40))).toBe(true)
  })

  test('a word still being learnt is not', () => {
    expect(isKnown(item('review', MATURE_INTERVAL_DAYS - 1))).toBe(false)
    expect(isKnown(item('learning', 1))).toBe(false)
    expect(isKnown(item('new'))).toBe(false)
  })

  test('a pooled sentence is never known', () => {
    // Pool items carry interval 0 and are not scheduled at all; nothing about
    // sitting in the intake queue is a claim that you know it.
    expect(isKnown(item('pool'))).toBe(false)
  })
})
