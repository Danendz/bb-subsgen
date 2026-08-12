import { isHan } from '../lang/segment'

/** How far the pointer must travel before a mouseup counts as a drag, not a click. */
const DRAG_THRESHOLD_PX = 4

export function containsHan(text: string): boolean {
  return Array.from(text).some(isHan)
}

/**
 * Decides when a drag-selection should swallow the click that follows it.
 *
 * Chrome fires `click` whenever mousedown and mouseup land in the same element
 * — including when you dragged to select text in between. Inside an `<a>` that
 * means selecting Chinese to look it up would navigate away. A capture-phase
 * listener consults this to suppress exactly that one click.
 *
 * Kept as a state machine with no DOM in it so the arming rules can be tested
 * directly: it must arm only for a real drag over Han text, and must disarm
 * after a single click so ordinary clicking is never affected.
 */
export class ClickGuard {
  private origin: { x: number; y: number } | null = null
  private armed = false

  pointerDown(x: number, y: number): void {
    this.origin = { x, y }
    // A fresh press supersedes any pending suppression — otherwise a guard
    // armed by a drag that produced no click would eat an unrelated one later.
    this.armed = false
  }

  /**
   * Records the end of a drag. Returns whether a selection card should open.
   *
   * `selectedText` is the document's selection at mouseup.
   */
  pointerUp(x: number, y: number, selectedText: string): boolean {
    const origin = this.origin
    this.origin = null
    if (!origin) return false

    const moved = Math.abs(x - origin.x) > DRAG_THRESHOLD_PX ||
      Math.abs(y - origin.y) > DRAG_THRESHOLD_PX
    if (!moved || !containsHan(selectedText)) return false

    this.armed = true
    return true
  }

  /** Returns whether this click should be suppressed, and disarms either way. */
  shouldSuppressClick(): boolean {
    const suppress = this.armed
    this.armed = false
    return suppress
  }

  /** Drops a pending suppression — used when the card is dismissed instead. */
  disarm(): void {
    this.armed = false
    this.origin = null
  }
}
