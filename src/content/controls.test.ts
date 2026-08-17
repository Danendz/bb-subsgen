import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import {
  createGeometryGate,
  floorFor,
  HOVER_SETTLE_MS,
  liftFor,
  type PlayerGeometry,
} from './controls'
import { RESUME_GRACE_MS } from './hover'

const GAP = 8

describe('createGeometryGate', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  const setup = (initial: PlayerGeometry = { floor: 56, lift: 0 }) => {
    const hoverTarget = new EventTarget()
    let geometry = initial
    const onChange = vi.fn()
    const gate = createGeometryGate({
      measure: () => geometry,
      onChange,
      hoverTarget,
    })
    return {
      gate,
      onChange,
      enter: () => hoverTarget.dispatchEvent(new Event('pointerenter')),
      leave: () => hoverTarget.dispatchEvent(new Event('pointerleave')),
      set: (next: PlayerGeometry) => {
        geometry = next
      },
    }
  }

  test('emits the measured geometry', () => {
    const { gate, onChange } = setup()
    gate.update()
    expect(onChange).toHaveBeenCalledWith({ floor: 56, lift: 0 })
  })

  test('does not emit the same geometry twice', () => {
    const { gate, onChange } = setup()
    gate.update()
    gate.update()
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  test('holds the card still while the pointer is on it', () => {
    // The bug this exists for: lifting moves the card under the pointer, which
    // makes the video see mouseleave, which hides the controls, which drops the
    // card back out from under the pointer — oscillating ~10x a second.
    const { gate, onChange, enter, set } = setup({ floor: 56, lift: 119 })
    gate.update()
    onChange.mockClear()

    enter()
    set({ floor: 56, lift: 0 })
    gate.update()

    expect(onChange).not.toHaveBeenCalled()
  })

  test('applies the held-back geometry once the pointer has left and settled', () => {
    const { gate, onChange, enter, leave, set } = setup({ floor: 56, lift: 119 })
    gate.update()
    onChange.mockClear()

    enter()
    set({ floor: 56, lift: 0 })
    gate.update()
    leave()

    expect(onChange).not.toHaveBeenCalled()
    vi.advanceTimersByTime(HOVER_SETTLE_MS)
    expect(onChange).toHaveBeenCalledWith({ floor: 56, lift: 0 })
  })

  test('keeps holding when the pointer comes back before the settle elapses', () => {
    // Travelling from a word into its popup leaves and re-enters the host.
    const { gate, onChange, enter, leave, set } = setup({ floor: 56, lift: 119 })
    gate.update()
    onChange.mockClear()

    enter()
    leave()
    vi.advanceTimersByTime(HOVER_SETTLE_MS / 2)
    enter()
    set({ floor: 56, lift: 0 })
    vi.advanceTimersByTime(HOVER_SETTLE_MS)
    gate.update()

    expect(onChange).not.toHaveBeenCalled()
  })

  test('stops listening and drops a pending settle once stopped', () => {
    const { gate, onChange, enter, leave, set } = setup({ floor: 56, lift: 119 })
    gate.update()
    onChange.mockClear()

    enter()
    leave()
    gate.stop()
    set({ floor: 0, lift: 0 })
    vi.advanceTimersByTime(HOVER_SETTLE_MS * 2)

    expect(onChange).not.toHaveBeenCalled()
  })

  test('outlasts the popup, so the card never moves out from under one', () => {
    // hover.ts keeps the popup on screen for RESUME_GRACE_MS after the pointer
    // leaves, and the popup is positioned against the host rather than the
    // card — so moving the card during that window visibly detaches the two.
    expect(HOVER_SETTLE_MS).toBeGreaterThanOrEqual(RESUME_GRACE_MS)
  })
})

describe('floorFor', () => {
  test('keeps the card off the danmaku bar below the video', () => {
    // Measured on a real page in normal mode: the player container runs
    // 172-919 but the video ends at 863 — the last 56px is the comment input,
    // and a card at 0% would render on top of it, outside the video entirely.
    expect(floorFor({ top: 172, bottom: 919 }, { top: 172, bottom: 863 })).toBe(56)
  })

  test('is zero in fullscreen, where the video fills the container', () => {
    expect(floorFor({ top: 0, bottom: 900 }, { top: 0, bottom: 900 })).toBe(0)
  })

  test('is zero rather than negative if the video overflows the container', () => {
    expect(floorFor({ top: 0, bottom: 900 }, { top: 0, bottom: 950 })).toBe(0)
  })
})

describe('liftFor', () => {
  test('clears a control bar overlaying the bottom of the player', () => {
    // Measured from a real Bilibili page in normal mode: the container runs
    // 172-919, and .bpx-player-control-wrap starts at 808.
    expect(liftFor({ top: 172, bottom: 919 }, { top: 808, bottom: 863 }, GAP)).toBe(119)
  })

  test('ignores a bar sitting entirely below the video area', () => {
    // The danmaku send bar is a child of the player container but starts at
    // the container's bottom edge, so it covers no video and needs no lift.
    expect(liftFor({ top: 172, bottom: 919 }, { top: 919, bottom: 975 }, GAP)).toBe(0)
  })

  test('treats a bar whose top exactly meets the container bottom as no overlap', () => {
    expect(liftFor({ top: 0, bottom: 500 }, { top: 500, bottom: 560 }, GAP)).toBe(0)
  })

  test('never lifts further than the player is tall', () => {
    // A bar reported as covering the whole player would otherwise push the
    // card off the top of the video entirely.
    expect(liftFor({ top: 0, bottom: 500 }, { top: -100, bottom: 500 }, GAP)).toBe(500)
  })
})
