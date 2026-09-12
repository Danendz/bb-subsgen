// Chinese, assembled out of the modules around it.
//
// The only file in this directory the rest of the codebase is allowed to reach,
// and it is reached through `packs.ts` rather than by name.

import type { LanguagePack, SectionScheme } from '../pack'
import { entriesFrom, rank } from './entries'
import { findPatterns, patternsForWord } from './grammar/match'
import { PATTERNS } from './grammar/patterns'
import { loadChinese } from './lexicon'
import { sentenceTextAt } from './sentence'
import { isHan } from './segment'

/**
 * The word plus every character in it, for one batched lookup.
 *
 * A single character needs no breakdown — the breakdown of 我 is 我 — so it
 * asks for itself alone. Non-Han characters inside a headword are dropped:
 * there is nothing to look them up as.
 */
function cardHeadwords(headword: string): string[] {
  const chars = Array.from(headword).filter(isHan)
  return chars.length < 2 ? [headword] : [headword, ...chars]
}

/**
 * HSK 3.0's published band sizes, in order.
 *
 * Seven, not nine: the standard publishes 7-9 as one merged band and the pinned
 * dataset follows it, which is also why `complete-hsk-vocabulary`'s level tags
 * stop at `n7`. The sizes sum to 11,092 against roughly 11,400 ranked words, so
 * the last band absorbs the remainder — see `SectionScheme.sizes`.
 */
const HSK_BAND_SIZES = [500, 772, 973, 1000, 1071, 1140, 5636] as const

const hskSections: SectionScheme = {
  sizes: HSK_BAND_SIZES,
  // Not a locale lookup: 'HSK 4' is the scale's own name with a number after
  // it, and the six locales have nothing to say about either half.
  name: (index) => (index >= HSK_BAND_SIZES.length - 1 ? 'HSK 7-9' : `HSK ${index + 1}`),
}

export const chinesePack: LanguagePack = {
  code: 'zh',
  name: 'Chinese',
  nameKey: 'language.zh',
  levelsName: 'HSK',
  displaysTones: true,
  usesTraditional: true,
  speechSample: '你好，今天天气很好。',
  voiceLang: 'zh-CN',
  // Nothing outstanding: the grammar table ships and Chrome pairs zh→target
  // on device.
  comingSoon: [],
  sections: hskSections,

  inScript: isHan,
  containsScript: (text) => Array.from(text).some(isHan),

  load(raw) {
    return loadChinese(raw, this)
  },

  sentenceTextAt,
  cardHeadwords,

  findPatterns,
  patternsForWord,
  patternById: (id) => PATTERNS.find((pattern) => pattern.id === id),
  patterns: PATTERNS,

  entriesFrom,
  rank,
}
