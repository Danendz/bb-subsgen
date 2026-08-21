import { describe, expect, test } from 'vitest'
import { hoverOutcome, sameWord, type CardIdentity } from './lifecycle'
import type { Match } from '../lang/pack'

const match = (text: string, start: number): Match => ({
  text,
  pinyin: '',
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
