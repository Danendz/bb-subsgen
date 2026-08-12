// Underlines the matched word using the CSS Custom Highlight API.
//
// This is what lets the reader mark a word without touching the page: a
// Highlight paints over a Range the same way ::selection does, so no element
// is created, no text node is split, and a framework re-render can't fight it.
//
// The highlight's own styling can't live in our shadow root — ::highlight()
// resolves against the document that owns the ranges — so it goes into a
// single stylesheet appended to the page. That is the one and only mark the
// reader leaves on the DOM, and it's removed on teardown.

const HIGHLIGHT_NAME = 'bb-subsgen-word'
const STYLE_ID = 'bb-subsgen-highlight-style'

const STYLE = `
::highlight(${HIGHLIGHT_NAME}) {
  background-color: rgba(110, 168, 254, 0.28);
  text-decoration: underline;
  text-decoration-color: rgba(110, 168, 254, 0.9);
  text-decoration-thickness: 2px;
  text-underline-offset: 2px;
}
`

export interface WordHighlight {
  show(range: Range): void
  clear(): void
  destroy(): void
}

function supported(): boolean {
  return typeof CSS !== 'undefined' && 'highlights' in CSS && typeof Highlight === 'function'
}

/**
 * A no-op highlighter where the API is missing — the card still opens, the
 * word just isn't marked. Never a reason to fail a lookup.
 */
function noop(): WordHighlight {
  return { show() {}, clear() {}, destroy() {} }
}

export function createWordHighlight(): WordHighlight {
  if (!supported()) return noop()

  const highlight = new Highlight()
  CSS.highlights.set(HIGHLIGHT_NAME, highlight)

  let style = document.getElementById(STYLE_ID)
  if (!style) {
    style = document.createElement('style')
    style.id = STYLE_ID
    style.textContent = STYLE
    document.head.appendChild(style)
  }

  return {
    show(range) {
      highlight.clear()
      highlight.add(range)
    },
    clear() {
      highlight.clear()
    },
    destroy() {
      highlight.clear()
      CSS.highlights.delete(HIGHLIGHT_NAME)
      style?.remove()
    },
  }
}
