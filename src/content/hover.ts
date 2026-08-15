import { adoptStyles } from './overlay'
import { buildCard, cardHeadwords, characterBreakdown } from './card'
import { patternsForWord } from '../lang/grammar/match'
import type { Token } from '../lang/segment'
import { discoverWord, markKnown } from '../shared/flashcards-client'
import type { Context } from '../flashcards/types'
import type { DefsLookup } from '../shared/dict-client'

const DWELL_MS = 150
/** Grace period before resuming, so moving between words doesn't stutter playback.
 *  Also bounds how long the popup stays on screen after the pointer leaves,
 *  which is why controls.ts holds the card still for at least this long. */
export const RESUME_GRACE_MS = 400
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
  lookup: DefsLookup
  /** Read at popup-build time so live settings changes take effect. */
  isTraditional: () => boolean
  showToneColors: () => boolean
  /** The line currently on screen, snapshotted onto whatever gets discovered. */
  currentContext: () => Context | null
  /**
   * The line as segmented, for working out which structures the word sits in.
   *
   * Passed as tokens rather than as patterns because membership is decided per
   * word, and the line is already segmented for rendering — see `patternsForWord`.
   */
  currentTokens: () => Token[]
  known: () => Set<string>
  /**
   * A card actually opened on a word — the moment a lookup happens.
   *
   * On a line whose words are all known, this is an unambiguous "I could not
   * read that": the translation was withheld and you went looking for it. No
   * threshold to tune, which is why it is a separate signal from the dwell.
   */
  onLookup: (headword: string) => void
  /** How long the card stayed open, once the pointer has finally left. */
  onLookupEnd: (ms: number) => void
}

export function attachHover({
  shadowRoot,
  video,
  lookup,
  isTraditional,
  showToneColors,
  currentContext,
  currentTokens,
  known,
  onLookup,
  onLookupEnd,
}: HoverDeps): () => void {
  const controller = new HoverPauseController()
  let dwellTimer: ReturnType<typeof setTimeout> | null = null
  let resumeTimer: ReturnType<typeof setTimeout> | null = null
  let popup: HTMLElement | null = null
  let programmaticPause = false
  let activeWord: HTMLElement | null = null
  // When the current card opened. The video is paused throughout, so elapsed
  // wall-clock time here is real reading time rather than playback drifting on.
  let openedAt = 0

  const closePopup = () => {
    if (popup && openedAt) {
      onLookupEnd(Date.now() - openedAt)
      openedAt = 0
    }
    popup?.remove()
    popup = null
  }

  const openPopup = async (wordEl: HTMLElement, headword: string) => {
    // Asks for the characters alongside the word, in one batched round trip, so
    // this card carries the same per-character breakdown the reader's does — it
    // was asking for the headword alone and silently rendering a poorer card.
    const useTraditional = isTraditional()
    const found = await lookup(cardHeadwords(headword))
    closePopup()
    adoptStyles(shadowRoot)

    // The popup opening is the interaction that counts as discovery: it follows
    // a deliberate dwell, not a pointer crossing the line on its way elsewhere.
    discoverWord(headword, currentContext() ?? undefined)
    onLookup(headword)
    openedAt = Date.now()

    popup = buildCard(
      {
        headword,
        displayedPinyin: wordEl.dataset.pinyin ?? '',
        entries: found[headword] ?? [],
        breakdown: characterBreakdown(headword, found, useTraditional),
        patterns: patternsForWord(currentTokens(), headword),
        known: known().has(headword),
      },
      {
        useTraditional,
        toneColors: showToneColors(),
        onMarkKnown: (next) => markKnown(headword, next),
      },
    )
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
