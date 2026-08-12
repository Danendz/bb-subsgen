// Where a card goes relative to the thing it describes. Pure geometry, so the
// awkward cases — a word at the top of the viewport, a selection tall enough to
// fill it — are testable without a browser.

export interface Box {
  width: number
  height: number
}

export interface Anchor {
  left: number
  top: number
  right: number
  bottom: number
}

export const CARD_MARGIN = 8

export interface Placement {
  left: number
  top: number
}

function clamp(value: number, min: number, max: number): number {
  // `max` can fall below `min` when the card is wider or taller than the
  // viewport; the lower bound wins, so the card stays reachable.
  return Math.min(Math.max(value, min), Math.max(max, min))
}

/** How much two rectangles overlap, in square pixels. Zero means they're clear of each other. */
function overlapArea(a: Anchor, b: Anchor): number {
  const width = Math.min(a.right, b.right) - Math.max(a.left, b.left)
  const height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
  return width > 0 && height > 0 ? width * height : 0
}

function boxAt(placement: Placement, card: Box): Anchor {
  return {
    left: placement.left,
    top: placement.top,
    right: placement.left + card.width,
    bottom: placement.top + card.height,
  }
}

/**
 * Places a card next to its anchor without ever covering it.
 *
 * Below first, then above, then to either side, taking the first candidate that
 * both fits on screen and leaves the anchor visible. Covering the anchor is the
 * one outcome worth contorting to avoid: for a selection card the anchor *is*
 * the text you just selected, and a card sitting on top of it hides what you
 * were trying to read and blocks re-selecting it.
 *
 * Only when nothing fits does it fall back to the least-bad overlap, so a card
 * always lands somewhere visible rather than off screen.
 */
export function placeCard(anchor: Anchor, card: Box, viewport: Box): Placement {
  const maxLeft = viewport.width - card.width - CARD_MARGIN
  const maxTop = viewport.height - card.height - CARD_MARGIN

  // Centred on the anchor for the vertical candidates, aligned to its top for
  // the horizontal ones — both clamped so the card can't leave the viewport.
  const centredLeft = clamp(
    anchor.left + (anchor.right - anchor.left) / 2 - card.width / 2,
    CARD_MARGIN,
    maxLeft,
  )
  const alignedTop = clamp(anchor.top, CARD_MARGIN, maxTop)

  const candidates: Placement[] = [
    { left: centredLeft, top: anchor.bottom + CARD_MARGIN },
    { left: centredLeft, top: anchor.top - CARD_MARGIN - card.height },
    { left: anchor.right + CARD_MARGIN, top: alignedTop },
    { left: anchor.left - CARD_MARGIN - card.width, top: alignedTop },
  ]

  let best: { placement: Placement; overlap: number } | null = null

  for (const candidate of candidates) {
    const onScreen =
      candidate.left >= CARD_MARGIN &&
      candidate.top >= CARD_MARGIN &&
      candidate.left <= maxLeft &&
      candidate.top <= maxTop
    if (!onScreen) continue

    const overlap = overlapArea(boxAt(candidate, card), anchor)
    if (overlap === 0) return candidate
    if (!best || overlap < best.overlap) best = { placement: candidate, overlap }
  }

  if (best) return best.placement

  // Nothing fits: pin below the anchor, clamped into view. Whatever this
  // covers, it is at least on screen and next to what it describes.
  return {
    left: centredLeft,
    top: clamp(anchor.bottom + CARD_MARGIN, CARD_MARGIN, maxTop),
  }
}
