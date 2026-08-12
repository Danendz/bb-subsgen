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
  private before = ''
  private armed = false

  /** `selectedText` is what was already selected when the press landed. */
  pointerDown(x: number, y: number, selectedText: string): void {
    this.origin = { x, y }
    this.before = selectedText
    // A fresh press supersedes any pending suppression — otherwise a guard
    // armed by a drag that produced no click would eat an unrelated one later.
    this.armed = false
  }

  /**
   * Records the end of a press. Returns whether a selection card should open.
   *
   * `selectedText` is the document's selection at mouseup.
   *
   * Two ways to qualify, because neither covers the other. Movement catches a
   * drag, including re-dragging text that was already selected. A changed
   * selection catches double- and triple-click, which select a word or a whole
   * sentence without the pointer travelling a single pixel — those produced no
   * card at all while movement was the only test.
   *
   * Requiring one of the two is what keeps an ordinary click from arming. That
   * matters most over a `user-select: none` control: clicking one does not
   * collapse the selection the way clicking text does, so the selection is
   * still there at mouseup and "some Han text is selected" alone would suppress
   * the click and leave the button dead.
   */
  pointerUp(x: number, y: number, selectedText: string): boolean {
    const origin = this.origin
    this.origin = null
    if (!origin) return false

    const moved = Math.abs(x - origin.x) > DRAG_THRESHOLD_PX ||
      Math.abs(y - origin.y) > DRAG_THRESHOLD_PX
    const changed = selectedText !== this.before
    if (!moved && !changed) return false
    if (!containsHan(selectedText)) return false

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
    this.before = ''
  }
}
