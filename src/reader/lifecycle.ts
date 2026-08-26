// When a hover card should be replaced, kept, or torn down.
//
// Extracted from the event handlers because getting this wrong is what made the
// reader feel broken: the first version closed the card whenever no word sat
// under the pointer, which is the normal case over punctuation, gaps between
// glyphs, English text, images, page chrome — and over the card itself. A card
// that vanishes when you move toward it cannot be read.
//
// It has since collected the reader's other DOM-free lifecycle decisions —
// whether the configured modifier is down, and which of the six dismissals
// reaches which kind of card. Each was an expression inside a handler that only
// a browser could reach, and the suite has no browser.

import type { Match } from '../lang/pack'
import type { ReaderModifier } from '../shared/settings'

/**
 * Identity of the word a card is showing.
 *
 * Text alone isn't enough on either axis: the same word can occur twice in one
 * block, and the same word hovered on the page versus inside the selection card
 * needs a different anchor, so those are distinct targets too.
 */
export interface CardIdentity {
  text: string
  /** Position within its source — a flat-block index, or an index in the selection card. */
  start: number
  source: 'page' | 'selection'
}

export function sameWord(a: CardIdentity | null, b: CardIdentity | null): boolean {
  if (!a || !b) return false
  return a.text === b.text && a.start === b.start && a.source === b.source
}

export type HoverOutcome = 'keep' | 'replace'

/**
 * What a pointer move should do to the currently open card.
 *
 * `found` is null when there's no word under the pointer. That is deliberately
 * *not* a reason to close: the only things that dismiss a card are releasing
 * the modifier, Escape, scrolling, or landing on a different word.
 */
export function hoverOutcome(open: CardIdentity | null, found: Match | null): HoverOutcome {
  if (!found) return 'keep'
  // Page matches only — a card opened from the selection card is never "the
  // same" as the word now under the pointer, since it needs a different anchor.
  const identity: CardIdentity = { text: found.text, start: found.start, source: 'page' }
  return sameWord(open, identity) ? 'keep' : 'replace'
}

/** Which modifier keys are down, without a DOM event to ask. */
export interface ModifierState {
  shift: boolean
  alt: boolean
  ctrl: boolean
}

/**
 * Whether the configured modifier is the one being held.
 *
 * This replaced a `Record<ReaderModifier, 'shiftKey' | 'altKey' | 'ctrlKey'>`
 * in `reader.ts`: once the event is read into a `ModifierState` at the edge,
 * the table is the identity and the decision is testable without a
 * `KeyboardEvent`.
 */
export function modifierMatches(name: ReaderModifier, mods: ModifierState): boolean {
  return mods[name]
}

/** Why a card is being asked to go. */
export type DismissReason =
  /** Escape pressed. */
  | 'escape'
  /** The modifier came up, or focus left the window. */
  | 'release'
  /** A drag-selection started under the card. */
  | 'drag'
  /** The page scrolled beneath it. */
  | 'scroll'
  /** The selection card this one was opened from has gone. */
  | 'selection-card-closed'
  /** The reader is detaching. */
  | 'teardown'

/**
 * Which sources each reason dismisses.
 *
 * The complete rule was reconstructible only by reading six handlers, no two of
 * them adjacent: `release` says "only a page card closes" and
 * `closeSelectionCard` says the opposite for the other source, a hundred lines
 * away. Four rows are "page only" and three of the six break that pattern in
 * three different directions, which is why the exceptions are worth a table
 * rather than a comment each.
 */
const DISMISSES: Record<DismissReason, ReadonlyArray<CardIdentity['source']>> = {
  // The page is not being taken over any more, so a card that needed the
  // modifier goes. One hovered from the selection card never needed it.
  release: ['page'],
  // It is about to be dragged across, and would flash over the text being
  // selected.
  drag: ['page'],
  // A page card is tied to a highlighted range that scrolls out from under it.
  // The selection card is a panel about text you already chose — a stray
  // trackpad nudge must not throw it away — and neither is a word card anchored
  // to that panel.
  scroll: ['page'],
  // Anchored to a panel that is no longer there, with nothing left to sit
  // beside.
  'selection-card-closed': ['selection'],
  // The two reasons that mean *everything*: an explicit dismissal, and the
  // reader going away underneath both.
  escape: ['page', 'selection'],
  teardown: ['page', 'selection'],
}

export function dismisses(reason: DismissReason, open: CardIdentity | null): boolean {
  if (!open) return false
  return DISMISSES[reason].includes(open.source)
}
