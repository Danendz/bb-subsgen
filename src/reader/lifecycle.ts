// When a hover card should be replaced, kept, or torn down.
//
// Extracted from the event handlers because getting this wrong is what made the
// reader feel broken: the first version closed the card whenever no word sat
// under the pointer, which is the normal case over punctuation, gaps between
// glyphs, English text, images, page chrome — and over the card itself. A card
// that vanishes when you move toward it cannot be read.

import type { Match } from '../lang/pack'

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
