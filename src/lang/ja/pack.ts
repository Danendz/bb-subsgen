// Japanese, assembled out of the modules around it.
//
// The only file in this directory the rest of the codebase is allowed to reach,
// and it is reached through `packs.ts` rather than by name.

import type { LanguagePack } from '../pack'
import { entriesFrom, rank } from './entries'
import { loadJapanese } from './lexicon'
import { needsFurigana } from './script'
import { isJapanese } from './segment'
import { sentenceTextAt } from './sentence'

/**
 * The word plus the kanji in it, for one batched lookup.
 *
 * The kana are left out: they are not headwords worth breaking a word down
 * into, and asking for べ and る costs two round trips to learn nothing. A word
 * written in one kanji needs no breakdown — the breakdown of 犬 is 犬 — so it
 * asks for itself alone.
 */
function cardHeadwords(headword: string): string[] {
  const kanji = Array.from(headword).filter(needsFurigana)
  return kanji.length < 2 ? [headword] : [headword, ...kanji]
}

export const japanesePack: LanguagePack = {
  code: 'ja',
  name: 'Japanese',
  levelsName: 'JLPT',
  // Pitch accent is not modelled and is not planned, so there is no tone to
  // colour and nothing for the tone controls to switch.
  displaysTones: false,
  // One written form: there is no traditional/simplified choice to offer, so
  // the row is hidden rather than shown switched off.
  usesTraditional: false,
  speechSample: '今日はいい天気です。',
  voiceLang: 'ja-JP',

  inScript: isJapanese,
  containsScript: (text) => Array.from(text).some(isJapanese),

  load(raw) {
    return loadJapanese(raw, this)
  },

  sentenceTextAt,
  cardHeadwords,

  // A valid answer, not an absent capability. #14 ships no Japanese grammar
  // table, and every consumer of `findPatterns` already handles a line with no
  // patterns in it — so an empty table costs nothing, where `null` would grow a
  // check at every call site for a state one language happens to be in.
  findPatterns: () => [],
  patternsForWord: () => [],
  patternById: () => undefined,
  patterns: [],

  entriesFrom,
  rank,
}
