// Chinese, assembled out of the modules around it.
//
// The only file in this directory the rest of the codebase is allowed to reach,
// and it is reached through `packs.ts` rather than by name.

import type { LanguagePack } from '../pack'
import { parseDefinitions } from './definitions'
import { rankEntries } from './entries'
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

export const chinesePack: LanguagePack = {
  code: 'zh',
  name: 'Chinese',
  displaysTones: true,

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

  rankEntries,
  parseDefinitions,
}
