import {
  buildCard,
  buildWordElement,
  cardHeadwords,
  characterBreakdown,
  setCardTranslation,
} from '../content/card'
import { segment } from '../lang/segment'
import { blockAncestor, createBlockCache, indexOf, rangeOf, rootElement } from './block'
import { caretAt } from './caret'
import { createWordHighlight } from './highlight'
import { hoverOutcome, sameWord, type CardIdentity } from './lifecycle'
import { matchAt, type Match } from './lookup'
import { anchorFrom, placeCard, type Anchor } from './position'
import { ClickGuard } from './selection'
import { sentenceTextAt } from './sentence'
import type { SentenceTranslator } from './translator'
import type { DefsLookup } from '../shared/dict-client'
import type { ReaderMount } from './mount'
import type { PageMode } from './page-mode'
import type { ReaderModifier, Settings } from '../shared/settings'

const MODIFIER_PROPERTY: Record<ReaderModifier, 'shiftKey' | 'altKey' | 'ctrlKey'> = {
  shift: 'shiftKey',
  alt: 'altKey',
  ctrl: 'ctrlKey',
}

export interface ReaderDeps {
  mount: ReaderMount
  /** Force-selectable page text, switched on for as long as the modifier is held. */
  pageMode: PageMode
  lookup: DefsLookup
  translator: SentenceTranslator
  /** Lazily resolved: the 4.5MB word list is only fetched once you actually look something up. */
  words: () => Promise<Map<string, string>>
  /** Read live, so settings changes take effect without a reload. */
  settings: () => Settings
}

/** Where an open card came from, so a repeat hover doesn't rebuild it. */
interface OpenCard {
  element: HTMLElement
  identity: CardIdentity
  anchor: Anchor
}

export function attachReader({
  mount,
  pageMode,
  lookup,
  translator,
  words,
  settings,
}: ReaderDeps): () => void {
  const { shadowRoot } = mount
  const highlight = createWordHighlight()
  const blockCache = createBlockCache()
  const guard = new ClickGuard()

  let held = false
  let dragging = false
  let open: OpenCard | null = null
  let selectionCard: HTMLElement | null = null
  let pending = 0
  let frame = 0
  let wordList: Map<string, string> | null = null

  const modifierHeld = (e: MouseEvent | KeyboardEvent): boolean =>
    e[MODIFIER_PROPERTY[settings().readerModifier]]

  /** Whether an event happened inside our own UI, rather than on the page. */
  const inOurUi = (e: Event): boolean => e.composedPath().includes(shadowRoot)

  /** Whether the page should be treated as inert for this event. */
  const takingOver = (e: Event): boolean => held && !inOurUi(e)

  /** Drops the card element but leaves the highlight alone. */
  const removeCard = () => {
    open?.element.remove()
    open = null
  }

  /**
   * Dismisses the card *and* its highlight.
   *
   * Kept distinct from `removeCard` because swapping one card for another used
   * to clear the highlight that had just been set for the incoming word — the
   * reason no highlight was ever visible.
   */
  const closeCard = () => {
    removeCard()
    highlight.clear()
  }

  /** Cards opened by hovering the page, as opposed to the selection card's words. */
  const pageCardOpen = () => open?.identity.source === 'page'

  const closeSelectionCard = () => {
    selectionCard?.remove()
    selectionCard = null
    // A word card anchored to the selection card has nothing left to sit
    // beside, so it goes with it rather than being left floating.
    if (open?.identity.source === 'selection') closeCard()
  }

  const place = (card: HTMLElement, anchor: Anchor) => {
    const { left, top } = placeCard(
      anchor,
      { width: card.offsetWidth, height: card.offsetHeight },
      { width: window.innerWidth, height: window.innerHeight },
    )
    card.style.left = `${left}px`
    card.style.top = `${top}px`
  }

  /** Fills the card's translation line in, if it's still the card on screen. */
  const fillTranslation = (card: HTMLElement, sentence: string, token: number) => {
    if (!settings().readerSentenceTranslation || !sentence) return

    const hit = translator.cached(sentence)
    if (hit !== undefined) {
      setCardTranslation(card, hit)
      return
    }

    void translator.translate(sentence).then((text) => {
      // A translation that lands after you've moved on belongs to a card that
      // no longer exists — dropping it is correct, not a failure.
      if (!text || token !== pending || !card.isConnected) return
      setCardTranslation(card, text)
      if (open?.element === card) place(card, open.anchor)
    })
  }

  /**
   * Builds and shows the card for a word.
   *
   * `anchor` is what the card must not cover — the word itself for a page
   * hover, the selection card for a word hovered inside it.
   */
  const openCard = async (
    match: Match,
    anchor: Anchor,
    sentence: string,
    identity: CardIdentity,
  ) => {
    const token = ++pending
    const { useTraditional, showToneColors } = settings()

    // One round trip for the word and every one of its characters.
    const found = await lookup(cardHeadwords(match.text))
    if (token !== pending) return // a later hover superseded this one

    removeCard()
    const card = buildCard(
      {
        headword: match.text,
        displayedPinyin: match.pinyin,
        entries: found[match.text] ?? [],
        breakdown: characterBreakdown(match.text, found, useTraditional),
      },
      { useTraditional, toneColors: showToneColors },
    )

    shadowRoot.appendChild(card)
    open = { element: card, identity, anchor }
    // Append before measuring — the card needs layout to have a size.
    place(card, anchor)
    fillTranslation(card, sentence, token)
  }

  /** Resolves the word under a point, or null if there isn't one. */
  const wordUnder = (x: number, y: number) => {
    if (!wordList) return null

    const caret = caretAt(x, y)
    if (!caret) return null

    const root = blockAncestor(caret.node)
    if (!root) return null
    // The player overlay's own card lives in the page, and hovering it must
    // not re-trigger a reader lookup on top of the player's. Checked from the
    // host element, since the caret now reaches inside shadow roots — including
    // the overlay's own.
    if (rootElement(root).closest('#bb-subsgen-host, #bb-subsgen-reader-host')) return null

    const block = blockCache(root)
    const index = indexOf(block, caret.node, caret.offset)
    if (index === null) return null

    const match = matchAt(block.text, index, wordList)
    if (!match) return null

    const range = rangeOf(block, match.start, match.end)
    if (!range) return null

    return { match, range, sentence: sentenceTextAt(block.text, index) }
  }

  const onPointerMove = (e: PointerEvent) => {
    if (!held) return
    // Mid-drag the pointer is drawing a selection, not pointing at a word. A
    // card opening under it would sit on top of the text being selected.
    if (dragging) return
    // Our own card is not the page. Reading it, selecting from it, or reaching
    // its copy buttons must never be mistaken for pointing away from the word.
    if (inOurUi(e)) return
    if (frame) return // already scheduled for this frame

    const { clientX, clientY } = e
    frame = requestAnimationFrame(() => {
      frame = 0
      const found = wordUnder(clientX, clientY)
      // 'keep' covers both "same word" and "no word here" — see lifecycle.ts.
      // The `!found` half is what makes pointing at a button a non-event.
      if (hoverOutcome(open?.identity ?? null, found?.match ?? null) === 'keep' || !found) return

      highlight.show(found.range)
      void openCard(found.match, found.range.getBoundingClientRect(), found.sentence, {
        text: found.match.text,
        start: found.match.start,
        source: 'page',
      })
    })
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      closeCard()
      closeSelectionCard()
      return
    }
    if (!modifierHeld(e) || held) return

    held = true
    // Links stop dragging and unselectable text becomes selectable from here
    // until the key comes up — the page is only ever overridden while you're
    // actually asking it to be.
    pageMode.activate()
    // Deferred until now, so a page you never look anything up on never pays
    // for the word list at all.
    if (!wordList) void words().then((loaded) => (wordList = loaded))
  }

  /** Hands the page back: its own cursors, links, and drag behaviour. */
  const release = () => {
    held = false
    dragging = false
    pageMode.deactivate()
    // Only the card the modifier opened. One hovered from the selection card
    // never needed the key held, so releasing it must not take that away.
    if (pageCardOpen()) closeCard()
  }

  const onKeyUp = (e: KeyboardEvent) => {
    if (!held || modifierHeld(e)) return
    release()
  }

  /**
   * Losing focus never delivers a keyup, which would strand the reader on.
   *
   * That matters much more now than it used to: a page left force-selectable
   * with every link dead is a worse bug than the one reader mode fixes.
   */
  const onBlur = () => {
    if (held) release()
  }

  const onClick = (e: MouseEvent) => {
    // Consulted unconditionally, because it also disarms: a guard armed by a
    // held drag and then left unread would eat the next ordinary click instead.
    const armed = guard.shouldSuppressClick()
    // The guard handles the modifier-free path, where a drag-selection's
    // trailing click would follow the link it started in. `takingOver` handles
    // the held one, where nothing reaches the page at all — which is also what
    // stops Shift+click opening the link in a new window.
    if (!armed && !takingOver(e)) return

    e.preventDefault()
    e.stopPropagation()
  }

  const onPointerDown = (e: PointerEvent) => {
    // Presses inside our own cards are interaction, not dismissal: copy
    // buttons, selecting a definition, hovering a word in the selection card.
    if (inOurUi(e)) return

    closeSelectionCard()

    if (held) {
      e.stopPropagation()
      dragging = true
      // The word card is about to be dragged across. It goes now rather than on
      // the first move, so it never flashes over the text you're selecting.
      if (pageCardOpen()) closeCard()
      // Shift+mousedown *extends* an existing selection rather than starting a
      // new one, so a second lookup would otherwise run all the way back to the
      // last one's anchor. Dropping the ranges leaves nothing to extend from.
      window.getSelection()?.removeAllRanges()
    }

    // Recorded last, so it reflects the clearing above rather than the
    // selection that preceded it — otherwise selecting the same sentence twice
    // in a row would read as "nothing changed" and open no card.
    guard.pointerDown(e.clientX, e.clientY, window.getSelection()?.toString() ?? '')
  }

  /**
   * Keeps the site's own handlers from running while the modifier is held.
   *
   * `stopPropagation` and deliberately *not* `preventDefault`: the browser's
   * default for a mousedown is to begin a selection, which is the whole point.
   * Preventing it is exactly what would leave the text unselectable again.
   *
   * `selectstart` is the valuable one — `onselectstart = () => false` is the
   * standard way sites block copying, and a handler we stop from running is a
   * `preventDefault` that never happens.
   */
  const onSuppressedEvent = (e: Event) => {
    if (takingOver(e)) e.stopPropagation()
  }

  /**
   * Cancels what CSS can't.
   *
   * `-webkit-user-drag: none` should mean `dragstart` never fires, so this is a
   * backstop for elements with an explicit `draggable` attribute. `contextmenu`
   * is what makes `ctrl` a usable modifier on macOS, where Ctrl+press would
   * otherwise open the context menu instead of selecting.
   */
  const onCancelledEvent = (e: Event) => {
    if (takingOver(e)) {
      e.preventDefault()
      e.stopPropagation()
    }
  }

  /**
   * Opens a word card for a word hovered inside the selection card.
   *
   * No modifier required — being inside the card is intent enough — and the
   * card is anchored to the selection card so the two don't overlap.
   */
  const onSelectionCardHover = (e: PointerEvent) => {
    const target = e.target
    if (!(target instanceof Element)) return
    const wordEl = target.closest<HTMLElement>('.word')
    if (!wordEl || !selectionCard) return

    const text = wordEl.dataset.text
    if (!text) return

    // Index within the card, so the same word appearing twice in a sentence
    // stays two distinct targets.
    const identity: CardIdentity = {
      text,
      start: Number(wordEl.dataset.index ?? 0),
      source: 'selection',
    }
    if (sameWord(open?.identity ?? null, identity)) return

    const match: Match = {
      text,
      pinyin: wordEl.dataset.pinyin ?? '',
      start: 0,
      end: text.length,
    }
    // Anchored to the selection card, not the word: the word card must not
    // cover the sentence you're reading it from. No sentence translation —
    // the selection card already shows the whole thing translated.
    void openCard(match, selectionCard.getBoundingClientRect(), '', identity)
  }

  const buildSelectionCard = (text: string, anchor: Anchor) => {
    const config = settings()
    const card = document.createElement('div')
    card.className = 'selection-card'

    const wordsEl = document.createElement('div')
    wordsEl.className = 'words'
    segment(text, wordList ?? new Map()).forEach((token, index) => {
      const wordEl = buildWordElement(token, {
        showPinyin: true,
        showToneColors: config.showToneColors,
      })
      wordEl.dataset.index = String(index)
      wordsEl.appendChild(wordEl)
    })
    card.appendChild(wordsEl)

    const sentence = document.createElement('div')
    sentence.className = 'popup-sentence'
    card.appendChild(sentence)

    card.addEventListener('pointerover', onSelectionCardHover)

    shadowRoot.appendChild(card)
    selectionCard = card
    place(card, anchor)
    return card
  }

  const onPointerUp = (e: PointerEvent) => {
    // Cleared before anything can return early. A drag that began on the page
    // and ended over one of our cards would otherwise leave it set, and hover
    // lookups suppressed until the next press.
    dragging = false
    if (inOurUi(e)) return
    if (held) e.stopPropagation()

    const selection = window.getSelection()
    const text = selection?.toString() ?? ''
    if (!guard.pointerUp(e.clientX, e.clientY, text)) return
    if (!selection?.rangeCount) return

    const anchor = anchorFrom(
      selection.getRangeAt(0).getBoundingClientRect(),
      e.clientX,
      e.clientY,
    )
    const token = ++pending

    // The selection card needs the word list for its pinyin, so this is the
    // other place it can first be required.
    const ready = wordList ? Promise.resolve(wordList) : words()
    void ready.then((loaded) => {
      wordList = loaded
      if (token !== pending) return
      closeSelectionCard()
      const card = buildSelectionCard(text, anchor)
      fillTranslation(card, text.trim(), token)
    })
  }

  /**
   * Only a page hover card goes on scroll: it's tied to a highlighted range
   * that scrolls out from under it. The selection card is a panel about text
   * you already chose — a stray trackpad nudge must not throw it away — and
   * neither is a word card anchored to that panel.
   */
  const onScroll = () => {
    if (pageCardOpen()) closeCard()
  }

  // Every one of these is capture phase on `window`, the first node an event
  // reaches. Stopping propagation there blocks the whole page beneath, while
  // our own sibling listeners on the same node still run.
  //
  // The over/out pairs are what keep a site's hover menus from unfurling under
  // the pointer while you read. `mouseenter`/`mouseleave` can't be caught this
  // way — they're dispatched only to their target — but delegated handlers,
  // which is how frameworks do it, all listen for the bubbling pair.
  //
  // `mousemove` is deliberately absent: it's the highest-frequency event on the
  // page, and stopping `mousedown` already prevents anything that drags.
  const SUPPRESSED = [
    'selectstart',
    'mousedown',
    'mouseup',
    'mouseover',
    'mouseout',
    'pointerover',
    'pointerout',
  ] as const
  const CANCELLED = ['dragstart', 'contextmenu'] as const

  window.addEventListener('pointermove', onPointerMove, { passive: true })
  window.addEventListener('keydown', onKeyDown, true)
  window.addEventListener('keyup', onKeyUp, true)
  window.addEventListener('blur', onBlur)
  window.addEventListener('click', onClick, true)
  window.addEventListener('pointerdown', onPointerDown, true)
  window.addEventListener('pointerup', onPointerUp, true)
  window.addEventListener('scroll', onScroll, { passive: true, capture: true })
  SUPPRESSED.forEach((type) => window.addEventListener(type, onSuppressedEvent, true))
  CANCELLED.forEach((type) => window.addEventListener(type, onCancelledEvent, true))

  return () => {
    if (frame) cancelAnimationFrame(frame)
    closeCard()
    closeSelectionCard()
    highlight.destroy()
    // Not `deactivate`: switching the reader off for an origin has to leave the
    // page exactly as it was found, stylesheet included.
    pageMode.destroy()
    guard.disarm()
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('keydown', onKeyDown, true)
    window.removeEventListener('keyup', onKeyUp, true)
    window.removeEventListener('blur', onBlur)
    window.removeEventListener('click', onClick, true)
    window.removeEventListener('pointerdown', onPointerDown, true)
    window.removeEventListener('pointerup', onPointerUp, true)
    window.removeEventListener('scroll', onScroll, true)
    SUPPRESSED.forEach((type) => window.removeEventListener(type, onSuppressedEvent, true))
    CANCELLED.forEach((type) => window.removeEventListener(type, onCancelledEvent, true))
  }
}
