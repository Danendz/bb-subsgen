import { describe, expect, test } from 'vitest'
import { dismisses, hoverOutcome, modifierMatches, sameWord, type CardIdentity } from './lifecycle'
import type { Match } from '../lang/pack'

const match = (text: string, start: number): Match => ({
  text,
  reading: [],
  start,
  end: start + text.length,
})

const page = (text: string, start: number): CardIdentity => ({ text, start, source: 'page' })
const inCard = (text: string, start: number): CardIdentity => ({
  text,
  start,
  source: 'selection',
})

describe('hoverOutcome', () => {
  test('replaces the card when a different word is found', () => {
    expect(hoverOutcome(page('学习', 0), match('中文', 2))).toBe('replace')
  })

  test('keeps the card when the same word is still under the pointer', () => {
    // Otherwise the card would rebuild on every mouse twitch.
    expect(hoverOutcome(page('学习', 0), match('学习', 0))).toBe('keep')
  })

  test('keeps the card when there is no word under the pointer', () => {
    // The reported bug: moving over a button, punctuation, an image, or the
    // card itself all produce null, and all used to destroy the card.
    expect(hoverOutcome(page('学习', 0), null)).toBe('keep')
  })

  test('opens a card when none is showing yet', () => {
    expect(hoverOutcome(null, match('学习', 0))).toBe('replace')
  })

  test('does nothing when there is neither a card nor a word', () => {
    expect(hoverOutcome(null, null)).toBe('keep')
  })

  test('treats the same word at a different position as a different target', () => {
    // 学习学习 — hovering the second occurrence must move the highlight.
    expect(hoverOutcome(page('学习', 0), match('学习', 2))).toBe('replace')
  })

  test('replaces a selection-card card when the page is hovered', () => {
    // hoverOutcome only ever sees page matches, so a card opened from the
    // selection card must not be mistaken for the word now under the pointer.
    expect(hoverOutcome(inCard('学习', 0), match('学习', 0))).toBe('replace')
  })
})

describe('sameWord', () => {
  test('matches on text, position and source together', () => {
    expect(sameWord(page('学习', 4), page('学习', 4))).toBe(true)
    expect(sameWord(page('学习', 4), page('学习', 6))).toBe(false)
    expect(sameWord(page('学习', 4), page('中文', 4))).toBe(false)
  })

  test('separates the same word on the page from one in the selection card', () => {
    // They need different anchors, so hovering one must not be treated as
    // already showing the other.
    expect(sameWord(page('学习', 0), inCard('学习', 0))).toBe(false)
  })

  test('never matches a missing side', () => {
    expect(sameWord(null, page('学习', 0))).toBe(false)
    expect(sameWord(page('学习', 0), null)).toBe(false)
    expect(sameWord(null, null)).toBe(false)
  })
})

describe('modifierMatches', () => {
  test('answers only for the modifier that is configured', () => {
    expect(modifierMatches('shift', { shift: true, alt: false, ctrl: false })).toBe(true)
    expect(modifierMatches('alt', { shift: true, alt: false, ctrl: false })).toBe(false)
  })

  test('a chord counts, so Shift+Alt still reads a page configured for Shift', () => {
    // The reader asks whether its key is down, not whether it is the only one.
    expect(modifierMatches('shift', { shift: true, alt: true, ctrl: false })).toBe(true)
  })
})

describe('dismisses', () => {
  test('releasing the modifier takes only the card the modifier opened', () => {
    // One hovered from the selection card never needed the key held, so
    // letting go of it must not take that away.
    expect(dismisses('release', page('学习', 0))).toBe(true)
    expect(dismisses('release', inCard('学习', 0))).toBe(false)
  })

  test('a scroll leaves the selection card’s word card alone', () => {
    // A page card is tied to a range that scrolls out from under it. The
    // selection card is a panel about text you already chose, and a stray
    // trackpad nudge must not throw it away.
    expect(dismisses('scroll', page('学习', 0))).toBe(true)
    expect(dismisses('scroll', inCard('学习', 0))).toBe(false)
  })

  test('starting a drag clears the page card before it can flash over the selection', () => {
    expect(dismisses('drag', page('学习', 0))).toBe(true)
    expect(dismisses('drag', inCard('学习', 0))).toBe(false)
  })

  test('closing the selection card takes its word card and nothing else', () => {
    // The one row that runs the other way: a card anchored to a panel that has
    // gone has nothing left to sit beside, while a page card is unaffected.
    expect(dismisses('selection-card-closed', inCard('学习', 0))).toBe(true)
    expect(dismisses('selection-card-closed', page('学习', 0))).toBe(false)
  })

  test('Escape means everything, whichever card is showing', () => {
    expect(dismisses('escape', page('学习', 0))).toBe(true)
    expect(dismisses('escape', inCard('学习', 0))).toBe(true)
  })

  test('teardown means everything, which is why detach closes unconditionally', () => {
    expect(dismisses('teardown', page('学习', 0))).toBe(true)
    expect(dismisses('teardown', inCard('学习', 0))).toBe(true)
  })

  test('never dismisses a card that is not there', () => {
    expect(dismisses('escape', null)).toBe(false)
    expect(dismisses('teardown', null)).toBe(false)
  })
})
