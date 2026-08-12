import type { Token } from '../lang/segment'
import { parseTone, toDiacritic, toneColor } from '../lang/tone'
import type { Settings } from '../shared/settings'
import type { ProgressView } from './progress'
import type { PlayerGeometry } from './controls'

const STYLE = `
:host {
  all: initial;
  position: absolute;
  inset: 0;
  pointer-events: none;
}

/* Owns the positioning, so the progress pill, the subtitle card and a
   standalone translation card stack vertically and stay centered together.

   Three independent inputs, resolved by CSS so no caller needs the others:
     --rest   the user's Height setting
     --floor  container below the video (the danmaku input row) — the Height
              slider is measured from the video's bottom edge, not the
              container's, or 0% renders the card on the comment box
     --lift   how much the control bar is currently covering
   max() picks the lift only when it would actually cover the card, so a card
   already dragged above the bar never jumps. */
.stack {
  position: absolute;
  bottom: max(calc(var(--rest, 8%) + var(--floor, 0px)), var(--lift, 0px));
  left: 50%;
  transform: translateX(-50%);
  width: fit-content;
  max-width: 90%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  pointer-events: none;
  /* Roughly matches Bilibili's own control fade, so the two move together. */
  transition: bottom 180ms ease;
}

.line {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  box-sizing: border-box;
  max-width: 100%;
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
   card would linger on screen as an empty box. This is why renderCue rebuilds
   .words every time instead of keeping it as a permanent child — a permanent
   child would mean :empty never matches. */
.line:empty { display: none; }

.words {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-items: flex-end;
}

/* Unlike .translation this can't use :empty — it always holds a bar element —
   so visibility is an explicit class. */
.progress {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 11px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(18, 20, 25, 0.72);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  color: #c3c8d0;
  font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
  font-size: 12px;
  font-weight: 500;
  line-height: 1;
  white-space: nowrap;
}
.progress.hidden { display: none; }

.progress-track {
  width: 70px;
  height: 4px;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.16);
  overflow: hidden;
}
.progress-fill {
  height: 100%;
  width: 0;
  border-radius: 2px;
  background: #6ea8fe;
  transition: width 200ms ease;
}

.translation {
  max-width: 100%;
  text-align: center;
  /* Muted, so it reads as secondary and doesn't compete with the tone colors. */
  color: #b4b4b4;
  font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
  font-weight: 400;
  line-height: 1.35;
}

/* The element is created as soon as a cue renders, but the translation lands
   asynchronously — hide it until there's text, so it claims no flex gap. */
.translation:empty { display: none; }

/* 'card' layout: the English line sits below the subtitle in its own card. */
.translation.standalone {
  box-sizing: border-box;
  padding: 6px 12px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}

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
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.popup-head-group {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
}

.copy-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 19px;
  height: 19px;
  padding: 0;
  border: none;
  border-radius: 5px;
  background: rgba(255, 255, 255, 0.08);
  color: #9aa3b2;
  cursor: pointer;
  transition: background-color 120ms ease, color 120ms ease;
}
.copy-btn:hover {
  background: rgba(255, 255, 255, 0.2);
  color: #fff;
}
.copy-btn.copied { color: #7ee0a8; }
.copy-btn svg { display: block; }
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

function ensureStack(shadowRoot: ShadowRoot): HTMLElement {
  adoptStyles(shadowRoot)
  let stack = shadowRoot.querySelector<HTMLElement>('.stack')
  if (!stack) {
    stack = document.createElement('div')
    stack.className = 'stack'

    // Ordered above the card so it inherits the stack's centering and its
    // control-bar lift for free, rather than needing its own positioning.
    const progress = document.createElement('div')
    progress.className = 'progress hidden'
    const track = document.createElement('div')
    track.className = 'progress-track'
    const fill = document.createElement('div')
    fill.className = 'progress-fill'
    track.appendChild(fill)
    const text = document.createElement('span')
    text.className = 'progress-text'
    progress.append(track, text)

    const line = document.createElement('div')
    line.className = 'line'

    stack.append(progress, line)
    shadowRoot.appendChild(stack)
  }
  return stack
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

function backdrop(settings: Settings): string {
  return `rgba(18, 20, 25, ${settings.backdropOpacity / 100})`
}

function buildTranslationElement(settings: Settings, text: string): HTMLElement {
  const el = document.createElement('div')
  el.className = 'translation'
  el.style.setProperty('font-size', `${settings.translationFontSize}px`)
  if (settings.translationLayout === 'card') {
    el.classList.add('standalone')
    el.style.setProperty('background', backdrop(settings))
  }
  el.textContent = text
  return el
}

export function renderCue(
  shadowRoot: ShadowRoot,
  tokens: Token[],
  settings: Settings,
  translation = '',
): void {
  const stack = ensureStack(shadowRoot)
  const line = stack.querySelector<HTMLElement>('.line')!

  // Only the resting position; `setLift` owns the other half of `bottom`.
  stack.style.setProperty('--rest', `${settings.positionPercent}%`)
  line.style.setProperty('background', backdrop(settings))

  const words = document.createElement('div')
  words.className = 'words'
  words.style.setProperty('gap', `${settings.wordSpacing}px`)
  words.style.setProperty('font-size', `${settings.fontSize}px`)
  words.replaceChildren(...tokens.map((token) => buildWordElement(token, settings)))

  // Rebuilt wholesale rather than kept around, so `.line:empty` still matches
  // once clearCue empties it.
  line.replaceChildren(words)
  stack.querySelector(':scope > .translation')?.remove()

  if (settings.showTranslation) {
    const el = buildTranslationElement(settings, translation)
    if (settings.translationLayout === 'card') stack.appendChild(el)
    else line.appendChild(el)
  }
}

/**
 * Fills in the English line for the cue already on screen.
 *
 * Patches the single text node rather than re-rendering: a full renderCue would
 * rebuild every `.word`, which destroys an open hover popup mid-read.
 */
export function setTranslation(shadowRoot: ShadowRoot, text: string): void {
  const el = shadowRoot.querySelector<HTMLElement>('.translation')
  if (el) el.textContent = text
}

/**
 * Sets how much of the player's bottom edge is unusable — permanently (the
 * danmaku row below the video) and transiently (the control bar).
 *
 * Independent of `renderCue`'s `--rest`; see the `.stack` rule for how the
 * three combine.
 */
export function setGeometry(shadowRoot: ShadowRoot, geometry: PlayerGeometry): void {
  // ensureStack rather than a query: the control bar can be showing before the
  // first cue paints, and an empty stack renders nothing anyway.
  const stack = ensureStack(shadowRoot)
  stack.style.setProperty('--floor', `${geometry.floor}px`)
  stack.style.setProperty('--lift', `${geometry.lift}px`)
}

export function setProgress(shadowRoot: ShadowRoot, view: ProgressView): void {
  // Likewise — the pack download happens before any cue has been rendered,
  // which is precisely when this needs to be on screen.
  const el = ensureStack(shadowRoot).querySelector<HTMLElement>('.progress')!
  el.classList.toggle('hidden', !view.visible)
  if (!view.visible) return
  el.querySelector<HTMLElement>('.progress-text')!.textContent = view.text
  el.querySelector<HTMLElement>('.progress-fill')!.style.setProperty(
    'width',
    `${Math.round(view.fraction * 100)}%`,
  )
}

export function clearCue(shadowRoot: ShadowRoot): void {
  shadowRoot.querySelector('.line')?.replaceChildren()
  shadowRoot.querySelector('.stack > .translation')?.remove()
}

/** Headword for the word element under `el`, for hover lookups. Null if `el` isn't inside a word. */
export function tokenTextAt(el: Element): string | null {
  return el.closest<HTMLElement>('.word')?.dataset.text ?? null
}
