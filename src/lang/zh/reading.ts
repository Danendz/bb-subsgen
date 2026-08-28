// Readings that depend on where the character stands, not on what it is.
//
// Most polyphonic characters are settled before this runs: `words.bin` carries
// one reading per headword, and function words declare theirs outright (see
// function-words.ts). That covers the character in isolation, which is most of
// the problem — 说 is `shuo1`, 了 is `le5`.
//
// What is left is the handful whose reading genuinely turns on their neighbours.
// The rules here are deliberately few. Each one names a structure it can
// recognise without a part-of-speech tagger, and anything needing more than that
// is left alone rather than guessed at — a confidently wrong reading is worse
// than the default, because it also drags the gloss along with it (`rankEntries`
// weights the displayed reading above everything else).

import type { ReadingPart, Token } from '../pack'
import { isNominal } from './grammar/function-words'
import { parseTone, toDiacritic } from './tone'

/**
 * A CC-CEDICT reading, cut into one part per syllable.
 *
 * Always one part per syllable, and `base` is the character it aligns with only
 * when the counts match. Mostly they do — one syllable is one character is the
 * whole reason a reading survived as a string this long — but CC-CEDICT carries
 * headwords where they cannot: 不入虎穴，焉得虎子 is nine code points and eight
 * syllables, because the comma is written and not said. There is no rule that
 * says which syllable the comma displaced, so none is guessed at.
 *
 * Nothing renders `base` yet: Chinese draws the reading as one run above the
 * whole word, so every case here looks identical on screen. It is #16 that
 * reads it, and an honest gap is a better thing to inherit than a confident
 * lie.
 */
export function readingParts(base: string, raw: string): ReadingPart[] {
  const syllables = raw.trim().split(/\s+/).filter(Boolean)
  if (!syllables.length) return []

  const chars = Array.from(base)
  const aligned = chars.length === syllables.length
  return syllables.map((syllable, i) => ({
    base: aligned ? chars[i] : '',
    text: toDiacritic(syllable),
    tone: parseTone(syllable),
  }))
}

/** Whether nothing precedes that a complement could attach back to. See `isNominal`. */
function isSubjectLike(token: Token | undefined): boolean {
  if (!token) return true // nothing precedes: no verb either way
  return isNominal(token.text)
}

/**
 * Corrects readings that depend on the tokens either side.
 *
 * Returns a new array; the input is left alone, because tokens are cached per
 * cue and re-rendered on every settings change.
 */
export function applyReadingRules(tokens: Token[]): Token[] {
  return tokens.map((token, i) => {
    const reading = ruleFor(token, tokens[i - 1], tokens[i + 1])
    return reading === null ? token : { ...token, reading: readingParts(token.text, reading) }
  })
}

function ruleFor(token: Token, before: Token | undefined, after: Token | undefined): string | null {
  // 得 is three words. As `de5` it is the structural particle, which is what it
  // is whenever something verbal precedes it — 跑得快, 过得很快. Sitting straight
  // after a subject it has nothing to attach to, and is `dei3`, "must": 我得走了.
  //
  // 受得了 is the exception that has to be checked first: there 得 is the
  // potential marker between a verb and 了, and it stays `de5`.
  if (token.text === '得') {
    if (after?.text === '了') return 'de5'
    return isSubjectLike(before) ? 'dei3' : 'de5'
  }

  // 了 after 不 or 得 is `liao3` — the potential complement, "cannot finish",
  // not the aspect marker. 吃不了, 受得了.
  if (token.text === '了' && (before?.text === '不' || before?.text === '得')) {
    return 'liao3'
  }

  return null
}
