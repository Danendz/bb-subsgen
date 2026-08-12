import { describe, expect, test } from 'vitest'
import { anchorFrom, placeCard, type Anchor, type Box } from './position'

describe('anchorFrom', () => {
  const rect = (left: number, top: number, right: number, bottom: number): Anchor => ({
    left,
    top,
    right,
    bottom,
  })

  test('keeps a real rect and ignores the pointer', () => {
    expect(anchorFrom(rect(319, 66, 415, 84), 900, 900)).toEqual(rect(319, 66, 415, 84))
  })

  test('falls back to the pointer for an all-zero rect', () => {
    // A selection crossing a shadow boundary can measure as nothing at all,
    // and placeCard resolves an all-zero anchor to the top-left corner.
    expect(anchorFrom(rect(0, 0, 0, 0), 640, 480)).toEqual(rect(640, 480, 640, 480))
  })

  test('keeps a rect with height but no width', () => {
    // A cross-tree selection measures 0 wide but carries the right line, which
    // is more useful than the pointer.
    expect(anchorFrom(rect(395, 133, 395, 150), 900, 900)).toEqual(rect(395, 133, 395, 150))
  })

  test('keeps a rect with width but no height', () => {
    expect(anchorFrom(rect(100, 200, 260, 200), 900, 900)).toEqual(rect(100, 200, 260, 200))
  })

  test('falls back for a collapsed rect away from the origin', () => {
    // Zero area is the signal, not zero coordinates.
    expect(anchorFrom(rect(500, 300, 500, 300), 640, 480)).toEqual(rect(640, 480, 640, 480))
  })
})

const viewport = { width: 1000, height: 800 }
const card = { width: 200, height: 120 }

/** A 40px-wide word, `left` from the viewport edge and `top` from its top. */
const word = (left: number, top: number): Anchor => ({
  left,
  right: left + 40,
  top,
  bottom: top + 20,
})

/** Whether a placed card would cover any part of its anchor. */
function covers(anchor: Anchor, box: Box, placement: { left: number; top: number }): boolean {
  const w = Math.min(anchor.right, placement.left + box.width) - Math.max(anchor.left, placement.left)
  const h = Math.min(anchor.bottom, placement.top + box.height) - Math.max(anchor.top, placement.top)
  return w > 0 && h > 0
}

describe('placeCard', () => {
  test('sits below the word, centred on it', () => {
    expect(placeCard(word(400, 400), card, viewport)).toEqual({ left: 320, top: 428 })
  })

  test('flips above when there is no room below', () => {
    const low = word(400, 700) // bottom at 720; 720 + 8 + 120 overflows 800
    expect(placeCard(low, card, viewport)).toEqual({ left: 320, top: 572 })
  })

  test('clamps against the left edge', () => {
    expect(placeCard(word(0, 400), card, viewport).left).toBe(8)
  })

  test('clamps against the right edge', () => {
    expect(placeCard(word(980, 400), card, viewport).left).toBe(792)
  })

  describe('never covering the anchor', () => {
    test('goes beside a selection too tall to clear vertically', () => {
      // A selection filling the viewport: neither below nor above has room, so
      // the card has to move sideways rather than land on the text.
      const tall: Anchor = { left: 300, right: 700, top: 10, bottom: 790 }
      const placement = placeCard(tall, card, viewport)
      expect(covers(tall, card, placement)).toBe(false)
      expect(placement.left).toBe(708) // to the right of the selection
    })

    test('goes to the left when there is no room on the right', () => {
      const tall: Anchor = { left: 300, right: 900, top: 10, bottom: 790 }
      const placement = placeCard(tall, card, viewport)
      expect(covers(tall, card, placement)).toBe(false)
      expect(placement.left).toBe(92) // 300 - 8 - 200
    })

    test('clears a selection pinned to the top of the viewport', () => {
      const top: Anchor = { left: 100, right: 600, top: 0, bottom: 60 }
      const placement = placeCard(top, card, viewport)
      expect(covers(top, card, placement)).toBe(false)
    })

    test('clears a selection pinned to the bottom of the viewport', () => {
      const bottom: Anchor = { left: 100, right: 600, top: 740, bottom: 800 }
      const placement = placeCard(bottom, card, viewport)
      expect(covers(bottom, card, placement)).toBe(false)
    })

    test('clears a multi-line selection in mid-page', () => {
      const block: Anchor = { left: 200, right: 800, top: 300, bottom: 460 }
      const placement = placeCard(block, card, viewport)
      expect(covers(block, card, placement)).toBe(false)
    })
  })

  describe('when nothing fits', () => {
    test('keeps the card on screen in a viewport smaller than the card', () => {
      const tiny = { width: 150, height: 100 }
      const placement = placeCard(word(10, 10), card, tiny)
      expect(placement.left).toBe(8)
      expect(placement.top).toBe(8)
    })

    test('prefers the least-overlapping side over going off screen', () => {
      // A selection covering nearly everything: some overlap is unavoidable,
      // but the result must still be within the viewport.
      const huge: Anchor = { left: 5, right: 995, top: 5, bottom: 795 }
      const placement = placeCard(huge, card, viewport)
      expect(placement.left).toBeGreaterThanOrEqual(8)
      expect(placement.top).toBeGreaterThanOrEqual(8)
      expect(placement.left + card.width).toBeLessThanOrEqual(viewport.width)
      expect(placement.top + card.height).toBeLessThanOrEqual(viewport.height)
    })
  })
})
