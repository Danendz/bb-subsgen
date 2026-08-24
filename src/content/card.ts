// The dictionary card, shared by the Bilibili subtitle overlay and the page
// reader. Both mount it into a shadow root of their own, so this module owns
// the markup and the styles but never the positioning.

import { toneColor } from '../lang/zh/tone'
import { readingFromText, readingText } from '../lang/reading'
import type { LanguagePack, Pattern, ReadingPart } from '../lang/pack'
import type { Token } from '../lang/pack'
import type { CedictEntry } from '../lang/pack'

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

/* Withheld, not removed — the row keeps its height so a line of mixed known
   and unknown words still sits on one baseline. Hovering anywhere in the line
   brings every reading back, so nothing is ever actually lost. */
.pinyin.withheld { visibility: hidden; }
.line:hover .pinyin.withheld,
.selection-card:hover .pinyin.withheld { visibility: visible; }

.hanzi {
  color: #fff;
  white-space: nowrap;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.55);
}

/* Structure, dimmed rather than annotated.
   The line already carries three rows over a video — characters, readings, and
   the translation — and prose about grammar would need a fourth. Dimming needs
   none: it costs no height and no reading, and it answers the question that
   actually blocks a learner mid-line, which is not "what does 得 mean" but
   "which of these am I even supposed to be looking up". Hovering still explains,
   because the card was always going to be where the explaining happened. */
.word.function .hanzi {
  color: #b9c0cc;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
}
.word.function .pinyin { color: #98a0ad; }
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
  gap: 6px;
  margin-top: 8px;
  padding-top: 7px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}
/* Same shape as the known button — they sit side by side and are equally
   ordinary things to do with a word you have just looked up. */
.explain-btn {
  padding: 3px 9px;
  border: none;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.08);
  color: #9aa3b2;
  font: inherit;
  font-size: 11.5px;
  cursor: pointer;
  transition: background-color 120ms ease, color 120ms ease;
}
.explain-btn:hover { background: rgba(255, 255, 255, 0.2); color: #fff; }
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

/* What the dictionary cannot say: the shape the word is part of. */
.popup-structure {
  margin-top: 8px;
  padding-top: 7px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}
.popup-structure-label {
  margin-bottom: 4px;
  font-size: 10.5px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #7c8496;
}
.popup-pattern + .popup-pattern {
  margin-top: 7px;
  padding-top: 7px;
  border-top: 1px solid rgba(255, 255, 255, 0.07);
}
.popup-pattern-skeleton {
  color: #fff;
  font-size: 12.5px;
  font-weight: 600;
}
.popup-pattern-name {
  margin-left: 7px;
  font-size: 11.5px;
  color: #8a92a3;
}
.popup-pattern-explanation {
  margin-top: 2px;
  font-size: 12px;
  color: #c3c8d0;
}

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

/** Opens the explanation drawer for the word this card is about. */
function buildExplainButton(onExplain: () => void): HTMLButtonElement {
  const button = document.createElement('button')
  button.className = 'explain-btn'
  button.textContent = 'Explain'

  button.addEventListener('click', (e) => {
    // Same reason as the other two: this click otherwise reaches Bilibili's
    // player and toggles playback.
    e.preventDefault()
    e.stopPropagation()
    onExplain()
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

/**
 * Renders a reading as tone-colored spans, one per part. Shared by the line and
 * the card.
 *
 * It draws what it is handed. It used to split a string and parse a tone digit
 * out of each piece, which put CC-CEDICT's notation inside a routine that is
 * supposed to work for any language — and it disagreed with the study app's
 * copy of the same loop about whether the separator was `' '` or `/\s+/`.
 */
export function buildReadingElement(
  parts: readonly ReadingPart[],
  className: string,
  toneColors: boolean,
): HTMLElement {
  const el = document.createElement('span')
  el.className = className
  for (const part of parts) {
    const sylEl = document.createElement('span')
    sylEl.className = 'syl'
    sylEl.textContent = part.text
    if (toneColors && part.tone !== null) sylEl.style.color = toneColor(part.tone)
    el.appendChild(sylEl)
  }
  return el
}

/** The subset of settings that word rendering depends on. */
export interface WordStyleOptions {
  showPinyin: boolean
  showToneColors: boolean
  /**
   * Render the reading but keep it invisible until hovered.
   *
   * Withheld rather than omitted so the line does not reflow: a cue almost
   * always mixes words you know with words you don't, and dropping the element
   * for some of them would leave the hanzi sitting at two different heights
   * across one line. It also means a word maturing mid-video changes nothing
   * about the layout.
   */
  hidePinyin?: boolean
}

export function buildWordElement(token: Token, options: WordStyleOptions): HTMLElement {
  const word = document.createElement('span')
  word.className = 'word'
  // Structure reads dimmer than vocabulary. Costs no height, which is the whole
  // reason it is a colour and not a label — see `.word.function` in WORD_STYLE.
  if (token.kind === 'function') word.classList.add('function')
  word.dataset.text = token.text
  // Lets the hover card show a reading even when CC-CEDICT has no entry, and is
  // the ranking signal it passes back as `displayedReading`. Whole, not split:
  // whoever reads it hands it straight to `rankEntries`.
  if (token.reading?.length) word.dataset.reading = readingText(token.reading)

  if (token.reading !== null && options.showPinyin) {
    const reading = buildReadingElement(token.reading, 'pinyin', options.showToneColors)
    if (options.hidePinyin) reading.classList.add('withheld')
    word.appendChild(reading)
  }

  const hanziEl = document.createElement('span')
  hanziEl.className = 'hanzi'
  hanziEl.textContent = token.text
  word.appendChild(hanziEl)

  return word
}

export interface CharacterGloss {
  char: string
  reading: ReadingPart[]
  gloss: string
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
  pack: LanguagePack,
  useTraditional = false,
): CharacterGloss[] {
  // The same list the lookup was batched from, minus the whole word: a
  // breakdown is exactly the pieces that lookup already asked about.
  const chars = pack.cardHeadwords(headword).slice(1)
  if (!chars.length) return []

  const rows: CharacterGloss[] = []
  for (const char of chars) {
    const [primary] = pack.rankEntries(found[char] ?? [], char, undefined, useTraditional)
    if (!primary) continue
    const { definitions } = pack.parseDefinitions(primary.definitions, useTraditional)
    if (!definitions.length) continue
    rows.push({
      char,
      reading: pack.readingOf(char, primary.pinyin),
      gloss: definitions.join('; '),
    })
  }
  return rows
}

export interface CardData {
  headword: string
  /**
   * The reading already on screen, if any — the strongest ranking signal.
   *
   * Display form, not an entry's notation: it comes off `dataset.reading`, or
   * from a `Match` the reader already resolved, and it is handed to
   * `rankEntries` whole. Nothing splits it.
   */
  displayedReading?: string
  entries: CedictEntry[]
  /**
   * Rows from `characterBreakdown`; empty renders no section.
   *
   * Always passed for a multi-character word rather than gated behind a click:
   * the characters are the reason you look a word up half the time, and the
   * lookup that fetches them is the same single batched message either way.
   */
  breakdown?: CharacterGloss[]
  /**
   * Patterns this word takes part in; empty renders no section.
   *
   * The section the dictionary cannot supply. A gloss describes a word, and for
   * a function word that is close to useless — CC-CEDICT calls 啊 an
   * "interjection of surprise", which is true of the character and wrong about
   * every sentence it ends. See lang/zh/grammar/patterns.ts.
   */
  patterns?: readonly Pattern[]
  /** Sentence translation; empty renders no section. */
  translation?: string
  /** Whether the headword is already marked known, for the toggle's initial state. */
  known?: boolean
}

export interface CardOptions {
  /** The language the card is about, and what ranks and parses its entries. */
  pack: LanguagePack
  useTraditional: boolean
  toneColors?: boolean
  /** Omitted renders no "I know this" button — which is what card tests want. */
  onMarkKnown?: (known: boolean) => void
  /**
   * Omitted renders no "Explain" button.
   *
   * Which is the case whenever no local model is configured: a button whose
   * only possible outcome is an apology is worse than no button.
   */
  onExplain?: () => void
}

/**
 * Builds the dictionary card for a single headword.
 *
 * Sections after the definitions are all optional and always appended in the
 * same order, so a card that gains its translation late grows downward rather
 * than reflowing around the text you're reading.
 */
export function buildCard(data: CardData, options: CardOptions): HTMLElement {
  const { pack, useTraditional, toneColors = true, onMarkKnown, onExplain } = options
  const { headword, displayedReading = '', entries: rawEntries } = data

  // File order puts variant spellings first for some characters, so rank
  // by relevance to the reading actually shown on screen.
  const entries = pack.rankEntries(rawEntries, headword, displayedReading, useTraditional)

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
  // With no entry there is nothing to align against and no tone to recover,
  // only the run already on screen. It still draws syllable by syllable, so a
  // card the dictionary missed is a card missing its colour, not its layout.
  const headReading: ReadingPart[] = primary
    ? pack.readingOf(headword, primary.pinyin)
    : readingFromText(displayedReading)
  if (headReading.length) {
    const readingGroup = document.createElement('span')
    readingGroup.className = 'popup-head-group'
    readingGroup.appendChild(buildReadingElement(headReading, 'popup-pinyin', toneColors))
    readingGroup.appendChild(buildCopyButton(readingText(headReading), 'Copy pinyin'))
    head.appendChild(readingGroup)
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
    const { definitions, classifiers } = pack.parseDefinitions(primary.definitions, useTraditional)

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
        item.appendChild(buildReadingElement(classifier.reading, 'popup-cl-pinyin', toneColors))
        row.appendChild(item)
      }
      el.appendChild(row)
    }

    // 多音字: surface the other readings rather than silently showing only one.
    const otherReadings = entries
      .slice(1)
      .map((entry) => entry.pinyin)
      .filter((raw) => raw !== primary.pinyin)
    if (otherReadings.length) {
      const alt = document.createElement('div')
      alt.className = 'popup-alt'
      // Run together, the way a dictionary prints a word rather than a gloss.
      const readings = otherReadings
        .map((raw) => readingText(pack.readingOf(headword, raw), ''))
        .join(', ')
      alt.textContent = `also read ${readings}`
      el.appendChild(alt)
    }
  }

  if (data.breakdown?.length) {
    const chars = document.createElement('div')
    chars.className = 'popup-chars'
    for (const { char, reading, gloss } of data.breakdown) {
      const row = document.createElement('div')
      row.className = 'popup-char'

      const word = document.createElement('span')
      word.className = 'popup-char-word'
      word.textContent = char
      row.appendChild(word)
      row.appendChild(buildReadingElement(reading, 'popup-char-pinyin', toneColors))

      const glossEl = document.createElement('span')
      glossEl.className = 'popup-char-gloss'
      glossEl.textContent = gloss
      glossEl.title = gloss // the row is clipped to one line
      row.appendChild(glossEl)

      chars.appendChild(row)
    }
    el.appendChild(chars)
  }

  if (data.patterns?.length) {
    const structure = document.createElement('div')
    structure.className = 'popup-structure'

    const label = document.createElement('div')
    label.className = 'popup-structure-label'
    label.textContent = 'Structure'
    structure.appendChild(label)

    for (const pattern of data.patterns) {
      const row = document.createElement('div')
      row.className = 'popup-pattern'

      const skeleton = document.createElement('span')
      skeleton.className = 'popup-pattern-skeleton'
      skeleton.textContent = pattern.skeleton
      row.appendChild(skeleton)

      const name = document.createElement('span')
      name.className = 'popup-pattern-name'
      name.textContent = pattern.name
      row.appendChild(name)

      const explanation = document.createElement('div')
      explanation.className = 'popup-pattern-explanation'
      explanation.textContent = pattern.explanation
      row.appendChild(explanation)

      structure.appendChild(row)
    }
    el.appendChild(structure)
  }

  if (onMarkKnown || onExplain) {
    const actions = document.createElement('div')
    actions.className = 'popup-actions'
    if (onMarkKnown) actions.appendChild(buildKnownButton(data.known ?? false, onMarkKnown))
    if (onExplain) actions.appendChild(buildExplainButton(onExplain))
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
