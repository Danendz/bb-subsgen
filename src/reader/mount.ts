import { CARD_STYLE, WORD_STYLE } from '../content/card'

const HOST_ID = 'bb-subsgen-reader-host'

// Fixed rather than absolute, so cards follow the viewport instead of the
// document — the reader has no player box to position against, and a scrolling
// page must not drag an open card away with it.
//
// `all: initial` is what keeps a site's own `*` rules off our UI, and the max
// z-index puts it over sticky headers and cookie banners.
const STYLE = `
:host {
  all: initial;
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 2147483646;
}

/* The selection card: a segmented run of words above its translation. */
.selection-card {
  position: absolute;
  box-sizing: border-box;
  max-width: min(460px, 90vw);
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(20, 22, 28, 0.94);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.45);
  color: #eef0f4;
  font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
  pointer-events: auto;
  user-select: text;
  z-index: 10;
}
.selection-card .words {
  font-size: 22px;
  gap: 4px;
  justify-content: flex-start;
}
.selection-card .popup-sentence {
  margin-top: 9px;
  padding-top: 8px;
  font-size: 13px;
}
.selection-pending {
  margin-top: 9px;
  padding-top: 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  color: #6e7686;
  font-size: 12px;
  font-style: italic;
}

/**
 * Shown in place of a word card when no dictionary is installed for the
 * language — silence would read as a bug here, since holding the modifier
 * down is the user asking a question.
 */
.dict-notice {
  position: absolute;
  box-sizing: border-box;
  max-width: min(320px, 90vw);
  padding: 8px 12px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(20, 22, 28, 0.94);
  color: #eef0f4;
  font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
  font-size: 13px;
  pointer-events: none;
  z-index: 10;
}

${WORD_STYLE}
${CARD_STYLE}
`

export interface ReaderMount {
  shadowRoot: ShadowRoot
  destroy(): void
}

/**
 * Attaches the reader's shadow host to the document element.
 *
 * On `documentElement` rather than `body` because single-page apps replace the
 * body wholesale on navigation, which would take the host with it.
 */
export function mountReader(): ReaderMount {
  document.getElementById(HOST_ID)?.remove()

  const host = document.createElement('div')
  host.id = HOST_ID
  const shadowRoot = host.attachShadow({ mode: 'open' })

  const sheet = new CSSStyleSheet()
  sheet.replaceSync(STYLE)
  shadowRoot.adoptedStyleSheets = [sheet]

  document.documentElement.appendChild(host)

  return {
    shadowRoot,
    destroy() {
      host.remove()
    },
  }
}
