// The dictionary word under a character, for the page reader's hover card.
//
// Lives here rather than in `reader/` because it is not reader infrastructure:
// it scans backwards from the hovered character because Chinese has no spaces,
// and it ranks candidates by whether CC-CEDICT has a reading for them. Both are
// facts about the language, not about hovering.

import { isHan } from './segment'

export interface Match {
  text: string
  /** CC-CEDICT numeric-tone pinyin, or '' when only the characters are known. */
  pinyin: string
  start: number
  /** Exclusive. */
  end: number
}

/**
 * Longest dictionary entry that fits inside 8 characters.
 *
 * Longer headwords exist (chengyu explanations, place names), but scanning for
 * them costs quadratically and hovering rarely wants them — 8 covers every
 * ordinary word plus four-character idioms.
 */
const MAX_WORD_LENGTH = 8

/**
 * The dictionary word covering `index`, preferring the longest.
 *
 * Deliberately not forward-only: pointing at 京 in 北京大学 should give you
 * 北京大学, not 京大学 or 京. Chinese has no spaces, so the character you
 * happen to land on is rarely a word's first — matching only forward would
 * hand back a fragment for most of every word on the page.
 *
 * Falls back to the single character so a word the dictionary misses still
 * gets a card with whatever reading is known.
 */
export function matchAt(text: string, index: number, words: Map<string, string>): Match | null {
  const char = text[index]
  if (!char || !isHan(char)) return null

  let best: Match | null = null
  const first = Math.max(0, index - MAX_WORD_LENGTH + 1)

  for (let start = first; start <= index; start++) {
    const limit = Math.min(MAX_WORD_LENGTH, text.length - start)
    // Must reach past `index` to cover the hovered character.
    for (let length = limit; length > index - start; length--) {
      const candidate = text.slice(start, start + length)
      const pinyin = words.get(candidate)
      if (pinyin === undefined) continue
      // Earlier starts win ties, so a word is highlighted from its beginning.
      if (!best || length > best.end - best.start) {
        best = { text: candidate, pinyin, start, end: start + length }
      }
      break // nothing shorter from this start can beat what we just found
    }
  }

  if (best) return best
  return { text: char, pinyin: words.get(char) ?? '', start: index, end: index + 1 }
}
