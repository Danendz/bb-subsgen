// Cutting a Japanese line into words, by longest match against the installed
// lexicon — and, where the literal span is not a headword, against the
// dictionary forms it could be an inflection of.
//
// Deliberately not the Chinese algorithm. `zh/segment.ts` scores whole parses,
// because Chinese strands function characters constantly and the interesting
// question is which of two equally-long parses wrecks the remainder. Japanese
// does not have that problem in the same shape — kana runs already mark most
// boundaries — and it has a different one that Chinese does not have at all:
// 食べる appears on the page as 食べて, 食べた, 食べません, and none of those is
// a headword. That is what `deinflect` answers, and it is why this stays a
// plain longest match: the ambiguity it produces is resolved by the dictionary
// rather than by a parse score.
//
// **Literal first, deinflection only on a miss.** 言った and 行った are both
// real past tenses of real verbs, and at equal span the dictionary decides
// rather than rule order. Longer span still beats shorter, which the
// longest-first scan already gives.
//
// Two languages sharing `Lexicon` while sharing no algorithm is the point of
// the interface, not a gap in it.

import type { Token } from '../pack'
import { deinflect } from './deinflect'
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

/**
 * Shortest span worth asking `deinflect` about.
 *
 * The shortest form the table undoes is two characters — した, 来た — and the
 * walk runs on every span the literal lookup missed, which is nearly all of
 * them. Skipping the single characters is most of what that costs.
 */
const MIN_INFLECTED = 2

/** Whether this character is one the dictionary could be asked about. */
export function isJapanese(char: string): boolean {
  return isKana(char) || needsFurigana(char)
}

/** A span of the line the dictionary can account for. */
export interface Found {
  /** The span exactly as it appears in the text. */
  text: string
  /** The headword it is a form of. Absent when the surface already is it. */
  dictionary?: string
  /** The reading of the *surface*, not of the headword. */
  reading: string
}

/**
 * The reading a conjugated surface is said with, from its headword's.
 *
 * Every rule in `deinflect` edits a kana tail, so the surface and the
 * dictionary form share a prefix and differ only past it: たべる − る + て is
 * たべて, and かく − く + いた is かいた. Nothing has to align anything —
 * `furiganaParts` then puts たべ over 食 alone, exactly as it does for the
 * uninflected word.
 *
 * Null where the swap does not apply, which is the irregulars whose *stem*
 * changes: 来る reads くる and 来た reads きた, and no tail edit gets from one to
 * the other. Those take `furiganaParts`' existing failure path rather than a
 * confidently wrong alignment.
 */
function surfaceReading(surface: string, dictionary: string, reading: string): string | null {
  let shared = 0
  while (
    shared < surface.length &&
    shared < dictionary.length &&
    surface[shared] === dictionary[shared]
  ) {
    shared++
  }
  const tail = dictionary.slice(shared)
  if (!reading.endsWith(tail)) return null
  return reading.slice(0, reading.length - tail.length) + surface.slice(shared)
}

/**
 * The headword `surface` is an inflection of, or null.
 *
 * The class check is what `index.classes` was written for: a candidate is taken
 * only when the lexicon agrees the headword is a verb of exactly the class the
 * rule that produced it claimed. It is why 行った resolves to 行く and not to
 * 行つ — the table offers both, and only one of them is a word at all.
 *
 * `deinflect` answers shallowest-first, so the first accepted candidate is the
 * one that peeled the fewest suffixes.
 */
function inflectionOf(surface: string, index: JapaneseIndex, rare: boolean): Found | null {
  if (surface.length < MIN_INFLECTED) return null
  // Every form the table undoes ends in kana. Checking here rather than inside
  // the walk keeps the walk a pure function over a string.
  if (!isKana(surface[surface.length - 1])) return null

  for (const candidate of deinflect(surface)) {
    if (index.classes.get(candidate.text) !== candidate.class) continue
    if (!rare && index.rare.has(candidate.text)) continue
    const reading = index.words.get(candidate.text)
    if (reading === undefined) continue
    return {
      text: surface,
      dictionary: candidate.text,
      reading: surfaceReading(surface, candidate.text, reading) ?? '',
    }
  }
  return null
}

/** The literal headword, or the dictionary form it inflects — in that order. */
function lookupSpan(span: string, index: JapaneseIndex, rare: boolean): Found | null {
  const reading = index.words.get(span)
  if (reading !== undefined && (rare || !index.rare.has(span))) return { text: span, reading }
  return inflectionOf(span, index, rare)
}

/**
 * The longest span starting at `from` that the segmenter may take, or null.
 *
 * `rare` spellings are skipped rather than absent: 生る is a real entry and a
 * real lookup, and it is also a spelling that in running text is almost always
 * something else cut wrongly. The same separation the `p` flag gives Chinese
 * phrasebook entries — findable, never found.
 */
function longestFrom(run: string, from: number, index: JapaneseIndex): Found | null {
  const limit = Math.min(MAX_WORD, run.length - from)
  for (let length = limit; length >= 1; length--) {
    const found = lookupSpan(run.slice(from, from + length), index, false)
    if (found) return found
  }
  return null
}

function wordToken(found: Found): Token {
  return {
    text: found.text,
    ...(found.dictionary ? { dictionary: found.dictionary } : {}),
    reading: furiganaParts(found.text, found.reading),
    kind: 'content',
  }
}

function cut(run: string, index: JapaneseIndex): Token[] {
  const tokens: Token[] = []
  let unknown = ''

  const flush = () => {
    if (!unknown) return
    // One token for the whole unmatched run rather than one per character.
    // Cutting a word the dictionary cannot account for into five tokens would
    // say five wrong things instead of one honest one.
    tokens.push({ text: unknown, reading: null, kind: 'other' })
    unknown = ''
  }

  for (let at = 0; at < run.length;) {
    const found = longestFrom(run, at, index)
    if (found) {
      flush()
      tokens.push(wordToken(found))
      at += found.text.length
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

/** Where a span sits in the line it was found in. */
export interface Located extends Found {
  start: number
  /** Exclusive. */
  end: number
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
export function matchAt(text: string, at: number, index: JapaneseIndex): Located | null {
  const char = text[at]
  if (!char || !isJapanese(char)) return null

  let best: Located | null = null
  const first = Math.max(0, at - MAX_WORD + 1)

  for (let start = first; start <= at; start++) {
    const limit = Math.min(MAX_WORD, text.length - start)
    // Must reach past `at` to cover the hovered character.
    for (let length = limit; length > at - start; length--) {
      const found = lookupSpan(text.slice(start, start + length), index, true)
      if (!found) continue
      // Earlier starts win ties, so a word is highlighted from its beginning.
      if (!best || length > best.end - best.start) {
        best = { ...found, start, end: start + length }
      }
      break // nothing shorter from this start can beat what we just found
    }
  }

  return best ?? { text: char, start: at, end: at + 1, reading: index.words.get(char) ?? '' }
}
