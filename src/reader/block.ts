// Flattens a block of a page into one string, with a map back to the text
// nodes it came from.
//
// This exists because `caretPositionFromPoint` hands back a single text node,
// and sites split sentences across inline elements constantly:
//
//   他在<a href="…">北京大学</a>学习中文。
//
// Reading forward from the caret inside one node would see the sentence as
// `学习中文。` and would never match a word straddling the `</a>`. Flattening
// the enclosing block fixes both at once: lookups run against the flat string,
// and a `Range` rebuilt from the index map can span the boundary.

/** Where a run of flat text came from. */
interface Chunk {
  node: Text
  /** Offset of this chunk's first character within the flat string. */
  start: number
}

/**
 * What a block gets flattened from.
 *
 * A `ShadowRoot` is a legitimate root because a `TreeWalker` never descends
 * into one: a root chosen outside a shadow tree would flatten to text that
 * doesn't contain the node we started from. See `blockAncestor`.
 */
export type BlockRoot = Element | ShadowRoot

/** The element a block hangs off, so callers can run selector checks against it. */
export function rootElement(root: BlockRoot): Element {
  return root instanceof ShadowRoot ? root.host : root
}

export interface FlatBlock {
  /** The block's text with no element boundaries in it. */
  text: string
  chunks: Chunk[]
  /** What `text` was built from, for cache invalidation. */
  root: BlockRoot
  /**
   * `root.textContent` as it stood when this was built.
   *
   * Not the same as `text` — that one omits skipped subtrees — so this is
   * recorded separately rather than derived, or a block containing ruby
   * annotations would look stale on every single hover.
   */
  signature: string
}

// Elements whose text is never page prose. `ruby`'s annotations are excluded
// rather than the whole element: the base text is real content, but rt/rp hold
// readings that would otherwise be spliced into the middle of a word.
const SKIPPED_TAGS = new Set([
  'SCRIPT',
  'STYLE',
  'NOSCRIPT',
  'TEXTAREA',
  'SELECT',
  'RT',
  'RP',
  'SVG',
])

/** Our own UI, and the native subtitles the player overlay already replaces. */
const SKIPPED_SELECTOR = '#bb-subsgen-host, #bb-subsgen-reader-host, .bpx-player-subtitle-wrap'

function isSkipped(el: Element): boolean {
  if (SKIPPED_TAGS.has(el.tagName)) return true
  if (el.closest(SKIPPED_SELECTOR)) return true
  // Only the `hidden` attribute, deliberately: catching CSS-hidden text would
  // mean getComputedStyle on every ancestor of every text node, on every hover.
  // Text you can't see is text you can't point at, so it costs nothing to miss.
  return el instanceof HTMLElement && Boolean(el.hidden)
}

const INLINE_DISPLAYS = new Set([
  'inline',
  'inline-block',
  'inline-flex',
  'inline-grid',
  'ruby',
  'ruby-base',
  'ruby-text',
  'contents',
])

/**
 * The nearest ancestor that lays its content out as a block.
 *
 * This is the unit we flatten: it's the largest span of text guaranteed to
 * read as one continuous passage, and small enough that flattening it on
 * every hover stays cheap.
 *
 * The walk stops dead at a shadow boundary and hands back the `ShadowRoot`
 * rather than continuing up through the host. It has to: `parentElement` is
 * null at the top of a shadow tree, and a Bilibili comment is all inline —
 * `span` inside `p`, both `display: inline` — so the walk ran out and returned
 * null, which is why comments were invisible to the reader. Crossing to the
 * host instead would be worse than useless, because `flattenBlock`'s
 * `TreeWalker` would then skip the shadow content entirely and produce text
 * that doesn't contain the node the caret landed on.
 */
export function blockAncestor(node: Node): BlockRoot | null {
  let el = node.parentElement
  while (el) {
    if (el === document.body || el === document.documentElement) return el
    const display = getComputedStyle(el).display
    if (!INLINE_DISPLAYS.has(display)) return el

    const parent = el.parentElement
    if (!parent) {
      const root = el.getRootNode()
      return root instanceof ShadowRoot ? root : null
    }
    el = parent
  }
  return null
}

/** Concatenates a block's text nodes, recording where each one landed. */
export function flattenBlock(root: BlockRoot): FlatBlock {
  const chunks: Chunk[] = []
  let text = ''

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = (node as Text).parentElement
      if (!parent) return NodeFilter.FILTER_REJECT
      // Walk up from the text node itself: TreeWalker filters are consulted
      // per node, so rejecting the container alone wouldn't skip its subtree.
      for (let el: Element | null = parent; el && el !== root; el = el.parentElement) {
        if (isSkipped(el)) return NodeFilter.FILTER_REJECT
      }
      return NodeFilter.FILTER_ACCEPT
    },
  })

  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const value = (node as Text).data
    if (!value) continue
    chunks.push({ node: node as Text, start: text.length })
    text += value
  }

  return { text, chunks, root, signature: root.textContent ?? '' }
}

/** Translates a flat-string index back to the text node and offset it came from. */
export function locate(block: FlatBlock, index: number): { node: Text; offset: number } | null {
  // Linear rather than binary: blocks are a handful of chunks in practice, and
  // this runs once per hover, not per character.
  for (let i = block.chunks.length - 1; i >= 0; i--) {
    const chunk = block.chunks[i]
    if (index >= chunk.start && index - chunk.start <= chunk.node.data.length) {
      return { node: chunk.node, offset: index - chunk.start }
    }
  }
  return null
}

/** Translates a text node and offset into its index in the flat string. */
export function indexOf(block: FlatBlock, node: Text, offset: number): number | null {
  for (const chunk of block.chunks) {
    if (chunk.node === node) return chunk.start + offset
  }
  return null
}

/**
 * Builds a Range over `[start, end)` of the flat string.
 *
 * The range may cross element boundaries — that's the point, and what lets the
 * highlight paint a word split by an inline tag as one continuous span.
 */
export function rangeOf(block: FlatBlock, start: number, end: number): Range | null {
  const from = locate(block, start)
  const to = locate(block, end)
  if (!from || !to) return null

  const range = document.createRange()
  range.setStart(from.node, from.offset)
  range.setEnd(to.node, to.offset)
  return range
}

/**
 * Caches the flattened form of the block last hovered.
 *
 * Hovering along a line re-enters the same block for every word, and pages
 * mutate underneath us, so the cache is keyed on the element and validated
 * against its current text rather than trusted indefinitely.
 */
export function createBlockCache(): (root: BlockRoot) => FlatBlock {
  let cached: FlatBlock | null = null

  return (root) => {
    if (cached && cached.root === root && root.textContent === cached.signature) {
      return cached
    }
    cached = flattenBlock(root)
    return cached
  }
}
