// The dictionary card, shared by the Bilibili subtitle overlay and the page
// reader. Both mount it into a shadow root of their own, so this module owns
// the markup and the styles but never the positioning.

import { parseTone, toDiacritic, toDiacriticPhrase, toneColor } from '../lang/tone'
import { parseDefinitions } from '../lang/definitions'
import { rankEntries } from '../lang/entries'
import { isHan, type Token } from '../lang/segment'
import type { CedictEntry } from '../lang/dict'

const MAX_DEFINITIONS = 3

/** Styles for a run of words with pinyin above — the subtitle line and the selection card. */
export const WORD_STYLE = `
.words {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-items: flex-end;
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
`

export const CARD_STYLE = `
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

/* Per-character breakdown, shown once the card is expanded. */
.popup-chars {
  margin-top: 8px;
  padding-top: 7px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}
.popup-char {
  display: flex;
  align-items: baseline;
  gap: 7px;
  font-size: 12px;
}
.popup-char + .popup-char { margin-top: 4px; }
.popup-char-word {
  flex: none;
  width: 1.4em;
  font-size: 15px;
  color: #fff;
}
.popup-char-pinyin {
  flex: none;
  min-width: 3.4em;
}
.popup-char-gloss {
  color: #c3c8d0;
  /* One line per character: the breakdown is a scan, not a read. */
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Sits above the translation, so a translation arriving late grows the card
   downward rather than shifting the button out from under the pointer. */
.popup-actions {
  display: flex;
  margin-top: 8px;
  padding-top: 7px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}
.known-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 8px 3px 6px;
  border: none;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.08);
  color: #9aa3b2;
  font: inherit;
  font-size: 11.5px;
  cursor: pointer;
  transition: background-color 120ms ease, color 120ms ease;
}
.known-btn:hover { background: rgba(255, 255, 255, 0.2); color: #fff; }
.known-btn.on { color: #7ee0a8; }
.known-btn svg { display: block; }

/* Sentence translation, always last so the card grows downward. */
.popup-sentence {
  margin-top: 8px;
  padding-top: 7px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  color: #b4b4b4;
  font-size: 12px;
  font-style: italic;
}
.popup-sentence:empty { display: none; }
`

const COPY_ICON =
  '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" ' +
  'stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' +
  '<rect x="9" y="9" width="12" height="12" rx="2"/>' +
  '<path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>'

const CHECK_ICON =
  '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" ' +
  'stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M4 12.5l5.2 5.2L20 7"/></svg>'

const COPIED_FEEDBACK_MS = 1100

/**
 * The "I already know this" toggle.
 *
 * Words enter the deck by being looked up — which happens precisely because you
 * didn't know them — so without this the common words that actually clutter the
 * screen would keep their pinyin forever, and hiding would only ever fire on the
 * rare words you studied. This is how 的 and 我们 get out of the way.
 */
function buildKnownButton(known: boolean, onToggle: (next: boolean) => void): HTMLButtonElement {
  const button = document.createElement('button')
  button.className = known ? 'known-btn on' : 'known-btn'
  // Constant markup — never interpolates dictionary or page data.
  button.innerHTML = `${CHECK_ICON}<span></span>`
  button.querySelector('span')!.textContent = known ? 'Known' : 'I know this'

  let state = known
  button.addEventListener('click', (e) => {
    // Same reason as the copy button: this click otherwise reaches Bilibili's
    // player and toggles playback.
    e.preventDefault()
    e.stopPropagation()

    state = !state
    button.classList.toggle('on', state)
    button.querySelector('span')!.textContent = state ? 'Known' : 'I know this'
    onToggle(state)
  })

  return button
}

/** A small button that copies `text`, briefly showing a check on success. */
function buildCopyButton(text: string, label: string): HTMLButtonElement {
  const button = document.createElement('button')
  button.className = 'copy-btn'
  button.title = label
  button.setAttribute('aria-label', label)
  // Constant markup — never interpolates dictionary or page data.
  button.innerHTML = COPY_ICON

  let resetTimer: ReturnType<typeof setTimeout> | null = null
  button.addEventListener('click', (e) => {
    // Without this the click reaches Bilibili's player and toggles playback.
    e.preventDefault()
    e.stopPropagation()

    navigator.clipboard.writeText(text).then(
      () => {
        button.innerHTML = CHECK_ICON
        button.classList.add('copied')
        if (resetTimer) clearTimeout(resetTimer)
        resetTimer = setTimeout(() => {
          button.innerHTML = COPY_ICON
          button.classList.remove('copied')
        }, COPIED_FEEDBACK_MS)
      },
      (err) => console.warn('[bb-subsgen] copy failed', err),
    )
  })

  return button
}

/** Renders a pinyin run as tone-colored syllable spans. Shared by the line and the card. */
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

/** The subset of settings that word rendering depends on. */
export interface WordStyleOptions {
  showPinyin: boolean
  showToneColors: boolean
}

export function buildWordElement(token: Token, options: WordStyleOptions): HTMLElement {
  const word = document.createElement('span')
  word.className = 'word'
  word.dataset.text = token.text
  // Lets the hover card show pinyin even when CC-CEDICT has no entry.
  if (token.pinyin) word.dataset.pinyin = token.pinyin

  if (token.pinyin !== null && options.showPinyin) {
    word.appendChild(buildPinyinElement(token.pinyin, 'pinyin', options.showToneColors))
  }

  const hanziEl = document.createElement('span')
  hanziEl.className = 'hanzi'
  hanziEl.textContent = token.text
  word.appendChild(hanziEl)

  return word
}

export interface CharacterGloss {
  char: string
  /** CC-CEDICT numeric-tone pinyin, kept raw so it can be tone-colored. */
  pinyin: string
  gloss: string
}

/**
 * Every headword a full card needs, for one batched lookup.
 *
 * A single character needs no breakdown — the breakdown of 我 is 我 — so it
 * asks for itself alone.
 */
export function cardHeadwords(headword: string): string[] {
  const chars = Array.from(headword).filter(isHan)
  return chars.length < 2 ? [headword] : [headword, ...chars]
}

/**
 * Builds the per-character rows for a multi-character word.
 *
 * Single characters get nothing: the breakdown of 我 is 我, which is noise.
 * Characters with no entry of their own are dropped rather than shown blank.
 */
export function characterBreakdown(
  headword: string,
  found: Record<string, CedictEntry[]>,
  useTraditional = false,
): CharacterGloss[] {
  const chars = Array.from(headword).filter(isHan)
  if (chars.length < 2) return []

  const rows: CharacterGloss[] = []
  for (const char of chars) {
    const [primary] = rankEntries(found[char] ?? [], char, undefined, useTraditional)
    if (!primary) continue
    const { definitions } = parseDefinitions(primary.definitions, useTraditional)
    if (!definitions.length) continue
    rows.push({ char, pinyin: primary.pinyin, gloss: definitions.join('; ') })
  }
  return rows
}

export interface CardData {
  headword: string
  /** The reading already on screen, if any — the strongest ranking signal. */
  displayedPinyin?: string
  entries: CedictEntry[]
  /**
   * Rows from `characterBreakdown`; empty renders no section.
   *
   * Always passed for a multi-character word rather than gated behind a click:
   * the characters are the reason you look a word up half the time, and the
   * lookup that fetches them is the same single batched message either way.
   */
  breakdown?: CharacterGloss[]
  /** Sentence translation; empty renders no section. */
  translation?: string
  /** Whether the headword is already marked known, for the toggle's initial state. */
  known?: boolean
}

export interface CardOptions {
  useTraditional: boolean
  toneColors?: boolean
  /** Omitted renders no "I know this" button — which is what card tests want. */
  onMarkKnown?: (known: boolean) => void
}

/**
 * Builds the dictionary card for a single headword.
 *
 * Sections after the definitions are all optional and always appended in the
 * same order, so a card that gains its translation late grows downward rather
 * than reflowing around the text you're reading.
 */
export function buildCard(data: CardData, options: CardOptions): HTMLElement {
  const { useTraditional, toneColors = true, onMarkKnown } = options
  const { headword, displayedPinyin = '', entries: rawEntries } = data

  // File order puts variant spellings first for some characters, so rank
  // by relevance to the reading actually shown on screen.
  const entries = rankEntries(rawEntries, headword, displayedPinyin, useTraditional)

  const el = document.createElement('div')
  el.className = 'popup'

  const head = document.createElement('div')
  head.className = 'popup-head'

  const wordGroup = document.createElement('span')
  wordGroup.className = 'popup-head-group'
  const wordSpan = document.createElement('span')
  wordSpan.className = 'popup-word'
  wordSpan.textContent = headword
  wordGroup.appendChild(wordSpan)
  wordGroup.appendChild(buildCopyButton(headword, `Copy ${headword}`))
  head.appendChild(wordGroup)

  const primary = entries[0]
  const headPinyin = primary?.pinyin || displayedPinyin
  if (headPinyin) {
    const pinyinGroup = document.createElement('span')
    pinyinGroup.className = 'popup-head-group'
    pinyinGroup.appendChild(buildPinyinElement(headPinyin, 'popup-pinyin', toneColors))
    // Copy the readable form, not CC-CEDICT's numeric-tone notation.
    pinyinGroup.appendChild(buildCopyButton(toDiacriticPhrase(headPinyin), 'Copy pinyin'))
    head.appendChild(pinyinGroup)
  }
  el.appendChild(head)

  const divider = document.createElement('div')
  divider.className = 'popup-divider'
  el.appendChild(divider)

  if (!primary) {
    const empty = document.createElement('div')
    empty.className = 'popup-empty'
    empty.textContent = 'No definition found'
    el.appendChild(empty)
  } else {
    // Lifts CC-CEDICT classifier notation out of the definition text, so raw
    // syntax never shows and classifiers don't eat a definition slot.
    const { definitions, classifiers } = parseDefinitions(primary.definitions, useTraditional)

    for (const definition of definitions.slice(0, MAX_DEFINITIONS)) {
      const def = document.createElement('div')
      def.className = 'popup-def'
      def.textContent = definition
      el.appendChild(def)
    }

    if (classifiers.length) {
      const row = document.createElement('div')
      row.className = 'popup-cl'
      const label = document.createElement('span')
      label.className = 'popup-cl-label'
      label.textContent = 'measure'
      row.appendChild(label)

      for (const classifier of classifiers) {
        const item = document.createElement('span')
        item.className = 'popup-cl-item'
        const word = document.createElement('span')
        word.className = 'popup-cl-word'
        word.textContent = classifier.word
        item.appendChild(word)
        item.appendChild(buildPinyinElement(classifier.pinyin, 'popup-cl-pinyin', toneColors))
        row.appendChild(item)
      }
      el.appendChild(row)
    }

    // 多音字: surface the other readings rather than silently showing only one.
    const otherReadings = entries
      .slice(1)
      .map((entry) => entry.pinyin)
      .filter((pinyin) => pinyin !== primary.pinyin)
    if (otherReadings.length) {
      const alt = document.createElement('div')
      alt.className = 'popup-alt'
      const readings = otherReadings.map((pinyin) => toDiacriticPhrase(pinyin, '')).join(', ')
      alt.textContent = `also read ${readings}`
      el.appendChild(alt)
    }
  }

  if (data.breakdown?.length) {
    const chars = document.createElement('div')
    chars.className = 'popup-chars'
    for (const { char, pinyin, gloss } of data.breakdown) {
      const row = document.createElement('div')
      row.className = 'popup-char'

      const word = document.createElement('span')
      word.className = 'popup-char-word'
      word.textContent = char
      row.appendChild(word)
      row.appendChild(buildPinyinElement(pinyin, 'popup-char-pinyin', toneColors))

      const glossEl = document.createElement('span')
      glossEl.className = 'popup-char-gloss'
      glossEl.textContent = gloss
      glossEl.title = gloss // the row is clipped to one line
      row.appendChild(glossEl)

      chars.appendChild(row)
    }
    el.appendChild(chars)
  }

  if (onMarkKnown) {
    const actions = document.createElement('div')
    actions.className = 'popup-actions'
    actions.appendChild(buildKnownButton(data.known ?? false, onMarkKnown))
    el.appendChild(actions)
  }

  // Created unconditionally so a translation arriving later can be patched in
  // without rebuilding the card; `:empty` keeps it invisible until it lands.
  const sentence = document.createElement('div')
  sentence.className = 'popup-sentence'
  sentence.textContent = data.translation ?? ''
  el.appendChild(sentence)

  return el
}

/**
 * Fills in the sentence translation on a card that's already on screen.
 *
 * Patching rather than rebuilding: a rebuild would drop the card's scroll and
 * selection state mid-read, and would reset the copy buttons' feedback.
 */
export function setCardTranslation(card: HTMLElement, text: string): void {
  const el = card.querySelector<HTMLElement>('.popup-sentence')
  if (el) el.textContent = text
}
