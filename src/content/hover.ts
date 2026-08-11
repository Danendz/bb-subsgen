import { adoptStyles, buildPinyinElement } from './overlay'
import { toDiacriticPhrase } from '../lang/tone'
import { parseDefinitions } from '../lang/definitions'
import type { CedictEntry } from '../lang/dict'

const DWELL_MS = 150
/** Grace period before resuming, so moving between words doesn't stutter playback. */
const RESUME_GRACE_MS = 400
const MAX_DEFINITIONS = 3
const POPUP_MARGIN = 8

/**
 * Tracks whether a hover-triggered pause is ours to resume. Never resumes a
 * pause the user initiated — via `onHoverStart` seeing an already-paused
 * video, or via `userPaused()` firing mid-hover.
 */
export class HoverPauseController {
  private weInitiatedPause = false

  /** Returns whether the caller should pause the video. */
  onHoverStart(paused: boolean): boolean {
    // Moving between words in the same line re-enters here while the video is
    // still paused by us. Keep ownership rather than reading the paused video
    // as a user pause, or we'd never resume when the pointer finally leaves.
    if (this.weInitiatedPause) return false
    this.weInitiatedPause = !paused
    return !paused
  }

  /** Returns whether the caller should resume the video. */
  onHoverEnd(): boolean {
    const shouldResume = this.weInitiatedPause
    this.weInitiatedPause = false
    return shouldResume
  }

  /** Call when the video pauses for a reason other than our own hover pause. */
  userPaused(): void {
    this.weInitiatedPause = false
  }
}

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

/** The `.word` an event target sits inside, or null if it isn't in one. */
function wordOf(node: EventTarget | null): HTMLElement | null {
  return node instanceof Element ? node.closest<HTMLElement>('.word') : null
}

/**
 * The hover region spans the word *and* its popup, so the pointer can travel
 * into the popup to select text without the hover being treated as ended.
 */
function inHoverRegion(node: EventTarget | null): boolean {
  return node instanceof Element && Boolean(node.closest('.word, .popup'))
}

export interface HoverDeps {
  shadowRoot: ShadowRoot
  video: HTMLVideoElement
  lookupDefs: (headword: string) => Promise<CedictEntry[]>
  /** Read at popup-build time so live settings changes take effect. */
  isTraditional: () => boolean
}

export function attachHover({
  shadowRoot,
  video,
  lookupDefs,
  isTraditional,
}: HoverDeps): () => void {
  const controller = new HoverPauseController()
  let dwellTimer: ReturnType<typeof setTimeout> | null = null
  let resumeTimer: ReturnType<typeof setTimeout> | null = null
  let popup: HTMLElement | null = null
  let programmaticPause = false
  let activeWord: HTMLElement | null = null

  const closePopup = () => {
    popup?.remove()
    popup = null
  }

  const buildPopupContent = (
    headword: string,
    fallbackPinyin: string,
    entries: CedictEntry[],
  ): HTMLElement => {
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
    const headPinyin = primary?.pinyin || fallbackPinyin
    if (headPinyin) {
      const pinyinGroup = document.createElement('span')
      pinyinGroup.className = 'popup-head-group'
      pinyinGroup.appendChild(buildPinyinElement(headPinyin, 'popup-pinyin', true))
      // Copy the readable form, not CC-CEDICT's numeric-tone notation.
      pinyinGroup.appendChild(
        buildCopyButton(toDiacriticPhrase(headPinyin), 'Copy pinyin'),
      )
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
      return el
    }

    // Lifts CC-CEDICT classifier notation out of the definition text, so raw
    // syntax never shows and classifiers don't eat a definition slot.
    const { definitions, classifiers } = parseDefinitions(
      primary.definitions,
      isTraditional(),
    )

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
        item.appendChild(buildPinyinElement(classifier.pinyin, 'popup-cl-pinyin', true))
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

    return el
  }

  const openPopup = async (wordEl: HTMLElement, headword: string) => {
    const entries = await lookupDefs(headword)
    closePopup()
    adoptStyles(shadowRoot)

    popup = buildPopupContent(headword, wordEl.dataset.pinyin ?? '', entries)
    // Append before measuring — the popup needs layout to have a width.
    shadowRoot.appendChild(popup)

    const wordRect = wordEl.getBoundingClientRect()
    const hostRect = shadowRoot.host.getBoundingClientRect()
    const popupWidth = popup.offsetWidth
    const popupHeight = popup.offsetHeight

    // Centre on the word, then clamp so it can't hang off the player edge.
    const wordCentre = wordRect.left - hostRect.left + wordRect.width / 2
    const maxLeft = hostRect.width - popupWidth - POPUP_MARGIN
    const left = Math.min(Math.max(wordCentre - popupWidth / 2, POPUP_MARGIN), Math.max(maxLeft, POPUP_MARGIN))
    popup.style.left = `${left}px`

    // Above the word by default; flip below when the subtitle sits high
    // enough that there's no room left above it.
    const wordTop = wordRect.top - hostRect.top
    if (wordTop - popupHeight - POPUP_MARGIN < 0) {
      popup.style.top = `${wordRect.bottom - hostRect.top + POPUP_MARGIN}px`
    } else {
      popup.style.top = `${wordTop - POPUP_MARGIN - popupHeight}px`
    }
  }

  const cancelLeave = () => {
    if (resumeTimer) {
      clearTimeout(resumeTimer)
      resumeTimer = null
    }
  }

  /**
   * Deferred rather than immediate so the pointer can cross the gap between a
   * word and its popup, or move on to the next word, without the popup
   * flickering shut and playback stuttering back on.
   */
  const scheduleLeave = () => {
    cancelLeave()
    resumeTimer = setTimeout(() => {
      resumeTimer = null
      activeWord = null
      closePopup()
      if (controller.onHoverEnd()) video.play()
    }, RESUME_GRACE_MS)
  }

  const onPointerOver = (e: Event) => {
    if (!inHoverRegion(e.target)) return
    cancelLeave()

    // Null inside the popup itself — stay open, keep the current word active.
    const wordEl = wordOf(e.target)
    if (!wordEl || wordEl === activeWord) return

    const headword = wordEl.dataset.text
    if (!headword) return
    activeWord = wordEl

    if (dwellTimer) clearTimeout(dwellTimer)
    dwellTimer = setTimeout(() => {
      if (controller.onHoverStart(video.paused)) {
        programmaticPause = true
        video.pause()
      }
      openPopup(wordEl, headword)
    }, DWELL_MS)
  }

  const onPointerOut = (e: Event) => {
    if (!inHoverRegion(e.target)) return
    // Still inside the region (hanzi ↔ pinyin, word ↔ popup): nothing to do.
    if (inHoverRegion((e as PointerEvent).relatedTarget)) return

    if (dwellTimer) {
      clearTimeout(dwellTimer)
      dwellTimer = null
    }
    scheduleLeave()
  }

  const onVideoPause = () => {
    if (programmaticPause) {
      programmaticPause = false
      return
    }
    controller.userPaused()
  }

  shadowRoot.addEventListener('pointerover', onPointerOver)
  shadowRoot.addEventListener('pointerout', onPointerOut)
  video.addEventListener('pause', onVideoPause)

  return () => {
    if (dwellTimer) clearTimeout(dwellTimer)
    if (resumeTimer) clearTimeout(resumeTimer)
    closePopup()
    shadowRoot.removeEventListener('pointerover', onPointerOver)
    shadowRoot.removeEventListener('pointerout', onPointerOut)
    video.removeEventListener('pause', onVideoPause)
  }
}
