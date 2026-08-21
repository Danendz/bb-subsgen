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

import type { Token } from '../pack'
import { isNominal } from './grammar/function-words'

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
    return reading === null ? token : { ...token, pinyin: reading }
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
