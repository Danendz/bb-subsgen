// Cutting a Japanese line into words, by longest match against the installed
// lexicon.
//
// Deliberately not the Chinese algorithm. `zh/segment.ts` scores whole parses,
// because Chinese strands function characters constantly and the interesting
// question is which of two equally-long parses wrecks the remainder. Japanese
// does not have that problem in the same shape — kana runs already mark most
// boundaries — and it has a different one that Chinese does not have at all:
// 食べる appears on the page as 食べて, 食べた, 食べません, and none of those is
// a headword. Until #15's deinflection table exists there is nothing for a
// Viterbi parse to choose *between*, so this is a plain longest match and #17
// is what hangs the candidate loop off it.
//
// Two languages sharing `Lexicon` while sharing no algorithm is the point of
// the interface, not a gap in it.

import type { Token } from '../pack'
import { furiganaParts } from './furigana'
import type { JapaneseIndex } from './lexicon'
import { isKana, needsFurigana } from './script'

/**
 * Longest headword the search will consider.
 *
 * JMdict carries whole phrases — 一石二鳥 and longer — and without a bound every
 * position would scan the rest of the line. 12 covers every ordinary word and
 * the four-character compounds; the phrases it loses are ones a segmenter
 * should not be claiming a span for anyway.
 */
const MAX_WORD = 12

/** Whether this character is one the dictionary could be asked about. */
export function isJapanese(char: string): boolean {
  return isKana(char) || needsFurigana(char)
}

/**
 * The longest headword starting at `from` that the segmenter may take, or null.
 *
 * `rare` spellings are skipped rather than absent: 生る is a real entry and a
 * real lookup, and it is also a spelling that in running text is almost always
 * something else cut wrongly. The same separation the `p` flag gives Chinese
 * phrasebook entries — findable, never found.
 */
function longestFrom(run: string, from: number, index: JapaneseIndex): string | null {
  const limit = Math.min(MAX_WORD, run.length - from)
  for (let length = limit; length >= 1; length--) {
    const candidate = run.slice(from, from + length)
    if (index.words.has(candidate) && !index.rare.has(candidate)) return candidate
  }
  return null
}

function wordToken(text: string, index: JapaneseIndex): Token {
  const reading = index.words.get(text) ?? ''
  return { text, reading: furiganaParts(text, reading), kind: 'content' }
}

function cut(run: string, index: JapaneseIndex): Token[] {
  const tokens: Token[] = []
  let unknown = ''

  const flush = () => {
    if (!unknown) return
    // One token for the whole unmatched run rather than one per character. An
    // inflected verb is unmatched until #15, and cutting 食べました into five
    // tokens would say five wrong things instead of one honest one.
    tokens.push({ text: unknown, reading: null, kind: 'other' })
    unknown = ''
  }

  for (let at = 0; at < run.length;) {
    const word = longestFrom(run, at, index)
    if (word) {
      flush()
      tokens.push(wordToken(word, index))
      at += word.length
    } else {
      unknown += run[at]
      at += 1
    }
  }
  flush()
  return tokens
}

export function segment(text: string, index: JapaneseIndex): Token[] {
  const tokens: Token[] = []
  let run = ''
  let other = ''

  const flushRun = () => {
    if (run) tokens.push(...cut(run, index))
    run = ''
  }
  const flushOther = () => {
    if (other) tokens.push({ text: other, reading: null, kind: 'other' })
    other = ''
  }

  for (const char of text) {
    if (isJapanese(char)) {
      flushOther()
      run += char
    } else {
      flushRun()
      other += char
    }
  }
  flushRun()
  flushOther()
  return tokens
}

/**
 * The dictionary word covering `index`, preferring the longest.
 *
 * Scans backwards as the Chinese matcher does, and for the same reason:
 * Japanese has no spaces either, so the character hovered is rarely a word's
 * first. Unlike segmentation this *does* return rare spellings — the point of
 * a hover is to find out what something is, and "findable, never found" is
 * exactly the line between the two.
 */
export function matchAt(
  text: string,
  at: number,
  index: JapaneseIndex,
): { text: string; start: number; end: number; reading: string } | null {
  const char = text[at]
  if (!char || !isJapanese(char)) return null

  let best: { text: string; start: number; end: number; reading: string } | null = null
  const first = Math.max(0, at - MAX_WORD + 1)

  for (let start = first; start <= at; start++) {
    const limit = Math.min(MAX_WORD, text.length - start)
    // Must reach past `at` to cover the hovered character.
    for (let length = limit; length > at - start; length--) {
      const candidate = text.slice(start, start + length)
      const reading = index.words.get(candidate)
      if (reading === undefined) continue
      // Earlier starts win ties, so a word is highlighted from its beginning.
      if (!best || length > best.end - best.start) {
        best = { text: candidate, start, end: start + length, reading }
      }
      break // nothing shorter from this start can beat what we just found
    }
  }

  return best ?? { text: char, start: at, end: at + 1, reading: index.words.get(char) ?? '' }
}
