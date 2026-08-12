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

/** The shadow-piercing form, newer than the base API and absent on older Chrome. */
interface CaretOptions {
  shadowRoots?: ShadowRoot[]
}
type PiercingDocument = Document & {
  caretPositionFromPoint?(x: number, y: number, options?: CaretOptions): CaretPosition & {
    offsetNode: Node
  } | null
}

/** How deep a nesting of shadow roots to follow before giving up. */
const MAX_SHADOW_DEPTH = 16

/**
 * The chain of shadow roots stacked under a point, outermost first.
 *
 * `caretPositionFromPoint` will only look inside roots you hand it, and there
 * is no way to ask "which ones are under here" — so we descend, using each
 * root's own `elementFromPoint` to find the next host down.
 *
 * This is not a rare shape. A Bilibili video page carries several hundred
 * shadow roots, and a single comment sits five deep:
 * `bili-comments` › `…-thread-renderer` › `…-replies-renderer` ›
 * `…-reply-renderer` › `bili-rich-text`.
 */
function shadowRootsAt(x: number, y: number): ShadowRoot[] {
  const roots: ShadowRoot[] = []
  let el = document.elementFromPoint(x, y)

  for (let depth = 0; el?.shadowRoot && depth < MAX_SHADOW_DEPTH; depth++) {
    roots.push(el.shadowRoot)
    const next = el.shadowRoot.elementFromPoint(x, y)
    // A root whose own hit test lands back on the host has nothing deeper to
    // offer; without this a slotted element would loop.
    if (!next || next === el) break
    el = next
  }

  return roots
}

/**
 * The text node and offset under a viewport point.
 *
 * `caretPositionFromPoint` is the standard; `caretRangeFromPoint` is the older
 * WebKit-derived spelling that Chrome still carries. Trying both costs nothing
 * and covers the versions where only one exists.
 *
 * Neither sees into a shadow root on its own — over a Bilibili comment the
 * plain call hands back the enclosing `div`, which reads exactly like "no text
 * here" and is why hovering comments did nothing at all.
 */
export function caretAt(x: number, y: number): CaretPosition | null {
  const doc = document as PiercingDocument
  const roots = shadowRootsAt(x, y)

  // Passed even when empty, so there is one code path rather than two. Older
  // Chrome ignores the extra argument rather than failing on it.
  const standard = doc.caretPositionFromPoint?.(x, y, { shadowRoots: roots })
  if (standard?.offsetNode instanceof Text) {
    return { node: standard.offsetNode, offset: standard.offset }
  }

  const legacy = (document as Document & LegacyCaretDocument).caretRangeFromPoint?.(x, y)
  if (legacy?.startContainer instanceof Text) {
    return { node: legacy.startContainer, offset: legacy.startOffset }
  }

  return null
}
