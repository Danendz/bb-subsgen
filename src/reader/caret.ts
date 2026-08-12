// Adapter over the caret-position APIs. Thin on purpose: jsdom implements
// neither, so everything downstream takes a `CaretPosition` rather than
// coordinates and stays testable.

export interface CaretPosition {
  node: Text
  offset: number
}

interface LegacyCaretDocument {
  caretRangeFromPoint?(x: number, y: number): Range | null
}

/**
 * The text node and offset under a viewport point.
 *
 * `caretPositionFromPoint` is the standard; `caretRangeFromPoint` is the older
 * WebKit-derived spelling that Chrome still carries. Trying both costs nothing
 * and covers the versions where only one exists.
 */
export function caretAt(x: number, y: number): CaretPosition | null {
  const standard = document.caretPositionFromPoint?.(x, y)
  if (standard?.offsetNode instanceof Text) {
    return { node: standard.offsetNode, offset: standard.offset }
  }

  const legacy = (document as Document & LegacyCaretDocument).caretRangeFromPoint?.(x, y)
  if (legacy?.startContainer instanceof Text) {
    return { node: legacy.startContainer, offset: legacy.startOffset }
  }

  return null
}
