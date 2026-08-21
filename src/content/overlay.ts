import { buildWordElement, CARD_STYLE, WORD_STYLE } from './card'
import type { Token } from '../lang/segment'
import type { Settings } from '../shared/settings'
import type { ProgressView } from './progress'
import type { PlayerGeometry } from './controls'
import type { Source } from './tier'

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

/* Sits below the card rather than above it, where the progress pill is: this
   reports something that has already stopped, so it must not push the line you
   are reading around, and it must not be mistaken for progress.

   The only part of the overlay that takes pointer events. The host is
   pointer-events: none so that hovering the video reaches the player's own
   controls; the two buttons here opt back in individually rather than the box
   doing it wholesale, which would put a dead rectangle over the video. */
.notice {
  display: flex;
  align-items: center;
  gap: 10px;
  max-width: min(560px, 100%);
  padding: 7px 8px 7px 13px;
  border-radius: 10px;
  border: 1px solid rgba(255, 138, 128, 0.28);
  background: rgba(38, 22, 22, 0.82);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  color: #f0c9c4;
  font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
  font-size: 12px;
  font-weight: 500;
  line-height: 1.35;
  text-align: left;
}
.notice.hidden { display: none; }

.notice-text { flex: 1; }

.notice-retry,
.notice-close {
  pointer-events: auto;
  cursor: pointer;
  flex: none;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: rgba(255, 255, 255, 0.08);
  color: inherit;
  font: inherit;
  font-weight: 500;
}
.notice-retry { padding: 4px 10px; }
.notice-close {
  width: 22px;
  height: 22px;
  border-color: transparent;
  background: none;
  font-size: 14px;
  line-height: 1;
}
.notice-retry:hover,
.notice-close:hover { background: rgba(255, 255, 255, 0.18); }

.translation {
  /* Anchors the .ai dot. */
  position: relative;
  max-width: 100%;
  text-align: center;
  /* Muted, so it reads as secondary and doesn't compete with the tone colors. */
  color: #b4b4b4;
  font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
  font-weight: 400;
  line-height: 1.35;
}

/* Marks a line the local model translated, as opposed to Chrome's on-device
   translator. A pseudo-element rather than a child, for two reasons:
   the :empty rule above still matches while the line is waiting for its text,
   and visibility: hidden on a withheld line takes the dot with it instead of
   leaking which translator was behind the blank.

   Violet is the one hue not already spoken for — the tone palette owns coral,
   amber, mint and sky, and the progress bar owns blue.

   Inline layout has no padding to sit inside, so the dot hangs off the right
   edge, vertically centered — clear of descenders on a one-line translation and
   of the wrap on a two-line one. On a translation long enough to reach
   max-width this paints a few pixels outside the card, which is a fair trade
   for never displacing the text. */
.translation.ai::after {
  content: "";
  position: absolute;
  top: 50%;
  right: -11px;
  transform: translateY(-50%);
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #b18aff;
}

/* The standalone card has padding, so the dot sits in the corner proper.
   The extra padding is what keeps it from touching the end of the sentence on
   a short line, and it is applied to both sides so the text stays centered in
   its box rather than being nudged left by the room the dot needs. */
.translation.ai.standalone {
  padding-left: 20px;
  padding-right: 20px;
}
.translation.ai.standalone::after {
  top: 6px;
  right: 7px;
  transform: none;
}

/* The element is created as soon as a cue renders, but the translation lands
   asynchronously — hide it until there's text, so it claims no flex gap. */
.translation:empty { display: none; }

/* Held back on a line whose words you all know, and in quiz mode. Hovering
   anywhere in the line reveals it at once — a quick glance to confirm should
   never be punished, and the reveal itself is the signal that the line was
   harder than its vocabulary suggested. */
.translation.withheld { visibility: hidden; }
.line:hover .translation.withheld { visibility: visible; }

/* 'card' layout: the English line sits below the subtitle in its own card. */
.translation.standalone {
  box-sizing: border-box;
  padding: 6px 12px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}

${WORD_STYLE}
${CARD_STYLE}
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

    // Below the line, unlike the progress pill above it: this reports something
    // that has stopped, and must not shift the sentence being read.
    const notice = document.createElement('div')
    notice.className = 'notice hidden'
    const noticeText = document.createElement('span')
    noticeText.className = 'notice-text'
    const retry = document.createElement('button')
    retry.className = 'notice-retry'
    retry.type = 'button'
    // Replaced on every render; see `NoticeView.action`.
    retry.textContent = 'Retry'
    const close = document.createElement('button')
    close.className = 'notice-close'
    close.type = 'button'
    close.textContent = '✕'
    close.title = 'Dismiss'
    notice.append(noticeText, retry, close)

    stack.append(progress, line, notice)
    shadowRoot.appendChild(stack)
  }
  return stack
}

function backdrop(settings: Settings): string {
  return `rgba(18, 20, 25, ${settings.backdropOpacity / 100})`
}

function buildTranslationElement(
  settings: Settings,
  view: CueView,
  withheld: boolean,
): HTMLElement {
  const el = document.createElement('div')
  el.className = withheld ? 'translation withheld' : 'translation'
  el.style.setProperty('font-size', `${settings.translationFontSize}px`)
  if (settings.translationLayout === 'card') {
    el.classList.add('standalone')
    el.style.setProperty('background', backdrop(settings))
  }
  markSource(el, view.translationSource)
  el.textContent = view.translation
  return el
}

/** Turns the dot on for the model's translations and off for everything else. */
function markSource(el: HTMLElement, source: Source | null): void {
  el.classList.toggle('ai', source === 'llm')
}

export interface CueView {
  tokens: Token[]
  translation: string
  /** Which translator produced `translation`; null while it is still empty. */
  translationSource: Source | null
  /** Words whose reading is withheld — declared known, or reviewed to maturity. */
  known: ReadonlySet<string>
  /** Withholds everything regardless of what you know, for testing yourself. */
  quiz: boolean
}

/**
 * Whether this line's translation should be held back.
 *
 * Quiz mode withholds unconditionally. Otherwise a line loses its translation
 * once every word in it is known — which is a claim about vocabulary, not about
 * grammar, and is sometimes wrong. That is deliberate: the reveal is cheap, and
 * needing it is exactly the evidence that the line is worth keeping.
 */
export function translationWithheld(view: CueView): boolean {
  if (view.quiz) return true
  const words = view.tokens.filter((token) => token.pinyin !== null)
  return words.length > 0 && words.every((token) => view.known.has(token.text))
}

export function renderCue(shadowRoot: ShadowRoot, view: CueView, settings: Settings): void {
  const stack = ensureStack(shadowRoot)
  const line = stack.querySelector<HTMLElement>('.line')!

  // Only the resting position; `setLift` owns the other half of `bottom`.
  stack.style.setProperty('--rest', `${settings.positionPercent}%`)
  line.style.setProperty('background', backdrop(settings))

  const words = document.createElement('div')
  words.className = 'words'
  words.style.setProperty('gap', `${settings.wordSpacing}px`)
  words.style.setProperty('font-size', `${settings.fontSize}px`)
  words.replaceChildren(
    ...view.tokens.map((token) =>
      buildWordElement(token, {
        ...settings,
        hidePinyin: view.quiz || view.known.has(token.text),
      }),
    ),
  )

  // Rebuilt wholesale rather than kept around, so `.line:empty` still matches
  // once clearCue empties it.
  line.replaceChildren(words)
  stack.querySelector(':scope > .translation')?.remove()

  if (settings.showTranslation) {
    const el = buildTranslationElement(settings, view, translationWithheld(view))
    if (settings.translationLayout === 'card') stack.appendChild(el)
    else line.appendChild(el)
  }
}

/**
 * Fills in the English line for the cue already on screen.
 *
 * Patches the single text node rather than re-rendering: a full renderCue would
 * rebuild every `.word`, which destroys an open hover popup mid-read.
 *
 * The mark is patched alongside it, because this is exactly the path a line
 * takes when it arrives from one translator and is filled in by the other.
 */
export function setTranslation(shadowRoot: ShadowRoot, text: string, source: Source | null): void {
  const el = shadowRoot.querySelector<HTMLElement>('.translation')
  if (!el) return
  el.textContent = text
  markSource(el, source)
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

export interface NoticeView {
  text: string
  /**
   * What the button says.
   *
   * Two jobs share this widget: reporting a run that stopped, where the button
   * is `Retry`, and asking whether a video is worth transcribing at all, where
   * it is `Transcribe`. Same shape, same placement, different sentence.
   */
  action: string
  onAction: () => void
  onDismiss: () => void
}

/**
 * Says something about transcription, with the two things you can do about it.
 *
 * Null hides it. The handlers are replaced rather than added to on every call,
 * because this is re-rendered on settings changes and on remounts, and
 * `addEventListener` would accumulate a retry per repaint.
 */
export function setNotice(shadowRoot: ShadowRoot, view: NoticeView | null): void {
  const el = ensureStack(shadowRoot).querySelector<HTMLElement>('.notice')!
  el.classList.toggle('hidden', !view)
  if (!view) return

  el.querySelector<HTMLElement>('.notice-text')!.textContent = view.text
  const action = el.querySelector<HTMLButtonElement>('.notice-retry')!
  action.textContent = view.action
  action.onclick = view.onAction
  el.querySelector<HTMLButtonElement>('.notice-close')!.onclick = view.onDismiss
}

export function clearCue(shadowRoot: ShadowRoot): void {
  shadowRoot.querySelector('.line')?.replaceChildren()
  shadowRoot.querySelector('.stack > .translation')?.remove()
}

/** Headword for the word element under `el`, for hover lookups. Null if `el` isn't inside a word. */
export function tokenTextAt(el: Element): string | null {
  return el.closest<HTMLElement>('.word')?.dataset.text ?? null
}
