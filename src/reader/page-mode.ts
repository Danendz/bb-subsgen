// Makes the page's text selectable for as long as the modifier is held.
//
// Most Chinese text worth looking up sits inside a link. On bilibili.com's home
// page 168 of the 219 elements holding Chinese text are inside an `<a href>`,
// against only 10 that set `user-select: none` — so the thing that actually
// stops you selecting a headline is native link drag-and-drop, not unselectable
// text. Pressing inside an anchor picks the link up instead of starting a
// selection, and no amount of event handling on our side changes that: it is
// decided by `-webkit-user-drag`, which only CSS can turn off.
//
// Hence a stylesheet rather than more listeners. It goes into the page because
// that is the tree it has to restyle — the same reason highlight.ts keeps its
// `::highlight()` rule there — and it is scoped to an attribute so that turning
// reader mode on and off is one attribute flip rather than re-parsing CSS on
// every keypress.
//
// Everything here is undone the moment the key comes up. A page left
// permanently force-selectable would be a far worse bug than the one this fixes.

const STYLE_ID = 'bb-subsgen-reader-mode-style'
const ACTIVE_ATTRIBUTE = 'data-bb-subsgen-reader'

// `cursor: text` is the only signal that the page is in a mode at all: without
// it nothing distinguishes reader mode from the normal page until a card opens.
//
// Our two shadow hosts live in the light DOM, so `*` matches them and both
// `cursor` and `user-select` would inherit straight through `:host { all:
// initial }` into our own UI. An ID selector outranks `*` with both important,
// which hands the cards their own cursors back.
const STYLE = `
html[${ACTIVE_ATTRIBUTE}] *,
html[${ACTIVE_ATTRIBUTE}] *::before,
html[${ACTIVE_ATTRIBUTE}] *::after {
  user-select: text !important;
  -webkit-user-select: text !important;
  -webkit-user-drag: none !important;
  cursor: text !important;
}

html[${ACTIVE_ATTRIBUTE}] #bb-subsgen-reader-host,
html[${ACTIVE_ATTRIBUTE}] #bb-subsgen-host {
  cursor: auto !important;
  user-select: auto !important;
}
`

export interface PageMode {
  activate(): void
  deactivate(): void
  destroy(): void
}

/** Installs the stylesheet, inert until `activate` is called. */
export function createPageMode(): PageMode {
  const root = document.documentElement

  let style = document.getElementById(STYLE_ID)
  if (!style) {
    style = document.createElement('style')
    style.id = STYLE_ID
    style.textContent = STYLE
    // `head` rather than `documentElement`, matching highlight.ts. Both are
    // valid parents for a style element; keeping them together makes the two
    // page-level marks the reader leaves easy to find and easy to audit.
    document.head.appendChild(style)
  }

  return {
    activate() {
      root.setAttribute(ACTIVE_ATTRIBUTE, '')
    },
    deactivate() {
      root.removeAttribute(ACTIVE_ATTRIBUTE)
    },
    destroy() {
      root.removeAttribute(ACTIVE_ATTRIBUTE)
      style?.remove()
    },
  }
}
