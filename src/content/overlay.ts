import type { Token } from '../lang/segment'
import { parseTone, toDiacritic, toneColor } from '../lang/tone'
import type { Settings } from '../shared/settings'

const STYLE = `
:host {
  all: initial;
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.line {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  width: fit-content;
  max-width: 90%;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-items: flex-end;
  box-sizing: border-box;
  padding: 8px 14px;
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  pointer-events: none;
  font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
  font-weight: 500;
  line-height: 1;
}

/* clearCue() empties the children between cues; without this the padded
   card would linger on screen as an empty box. */
.line:empty { display: none; }

.word {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 3px 5px;
  border-radius: 7px;
  pointer-events: auto;
  cursor: default;
  transition: background-color 120ms ease;
}
.word:hover { background: rgba(255, 255, 255, 0.16); }

/* Ruby annotation must read as subordinate to the characters — at equal
   size the two rows blur into a single run of text. */
.pinyin {
  font-size: 0.55em;
  letter-spacing: 0.02em;
  white-space: nowrap;
  color: #c3c8d0;
}
.pinyin .syl + .syl { margin-left: 0.25em; }

.hanzi {
  color: #fff;
  white-space: nowrap;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.55);
}

.popup {
  position: absolute;
  box-sizing: border-box;
  min-width: 180px;
  max-width: 300px;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(20, 22, 28, 0.94);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.45);
  color: #eef0f4;
  font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
  font-size: 13px;
  line-height: 1.45;
  /* Interactive so the text can be selected and copied — the hover region
     in hover.ts covers the popup as well as the word. */
  pointer-events: auto;
  user-select: text;
  cursor: auto;
  z-index: 10;
}
.popup-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
}
.popup-word {
  font-size: 19px;
  font-weight: 600;
  color: #fff;
}
.popup-pinyin {
  font-size: 13px;
  white-space: nowrap;
}
.popup-pinyin .syl + .syl { margin-left: 0.25em; }
.popup-divider {
  height: 1px;
  margin: 8px 0;
  background: rgba(255, 255, 255, 0.12);
}
.popup-def + .popup-def { margin-top: 3px; }
.popup-cl {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 9px;
  margin-top: 8px;
  padding-top: 7px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  font-size: 12px;
}
.popup-cl-label {
  color: #7c8496;
  margin-right: 1px;
}
.popup-cl-item {
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
}
.popup-cl-word { color: #fff; }
.popup-alt {
  margin-top: 7px;
  font-size: 11.5px;
  color: #8a92a3;
}
.popup-empty { color: #8a92a3; }
`

// A single constructed stylesheet, adopted by each shadow root.
//
// This deliberately avoids `shadowRoot.querySelector('style')` as an
// "already injected?" guard: other extensions (Dark Reader, for one) inject
// their own <style> elements into our shadow root, so that check reports a
// false positive and our styles never land.
let sheet: CSSStyleSheet | null = null

function styleSheet(): CSSStyleSheet {
  if (!sheet) {
    sheet = new CSSStyleSheet()
    sheet.replaceSync(STYLE)
  }
  return sheet
}

export function adoptStyles(shadowRoot: ShadowRoot): void {
  const ours = styleSheet()
  if (!shadowRoot.adoptedStyleSheets.includes(ours)) {
    shadowRoot.adoptedStyleSheets = [...shadowRoot.adoptedStyleSheets, ours]
  }
}

function ensureLine(shadowRoot: ShadowRoot): HTMLElement {
  adoptStyles(shadowRoot)
  let line = shadowRoot.querySelector<HTMLElement>('.line')
  if (!line) {
    line = document.createElement('div')
    line.className = 'line'
    shadowRoot.appendChild(line)
  }
  return line
}

/** Renders a pinyin run as tone-colored syllable spans. Shared by the line and the popup. */
export function buildPinyinElement(
  pinyin: string,
  className: string,
  toneColors: boolean,
): HTMLElement {
  const el = document.createElement('span')
  el.className = className
  for (const syllable of pinyin.split(' ')) {
    const sylEl = document.createElement('span')
    sylEl.className = 'syl'
    sylEl.textContent = toDiacritic(syllable)
    if (toneColors) sylEl.style.color = toneColor(parseTone(syllable))
    el.appendChild(sylEl)
  }
  return el
}

function buildWordElement(token: Token, settings: Settings): HTMLElement {
  const word = document.createElement('span')
  word.className = 'word'
  word.dataset.text = token.text
  // Lets the hover popup show pinyin even when CC-CEDICT has no entry.
  if (token.pinyin) word.dataset.pinyin = token.pinyin

  if (token.pinyin !== null && settings.showPinyin) {
    word.appendChild(buildPinyinElement(token.pinyin, 'pinyin', settings.showToneColors))
  }

  const hanziEl = document.createElement('span')
  hanziEl.className = 'hanzi'
  hanziEl.textContent = token.text
  word.appendChild(hanziEl)

  return word
}

export function renderCue(shadowRoot: ShadowRoot, tokens: Token[], settings: Settings): void {
  const line = ensureLine(shadowRoot)
  line.className = 'line'
  line.style.setProperty('bottom', `${settings.positionPercent}%`)
  line.style.setProperty('gap', `${settings.wordSpacing}px`)
  line.style.setProperty('font-size', `${settings.fontSize}px`)
  line.style.setProperty('background', `rgba(18, 20, 25, ${settings.backdropOpacity / 100})`)
  line.replaceChildren(...tokens.map((token) => buildWordElement(token, settings)))
}

export function clearCue(shadowRoot: ShadowRoot): void {
  shadowRoot.querySelector('.line')?.replaceChildren()
}

/** Headword for the word element under `el`, for hover lookups. Null if `el` isn't inside a word. */
export function tokenTextAt(el: Element): string | null {
  return el.closest<HTMLElement>('.word')?.dataset.text ?? null
}
