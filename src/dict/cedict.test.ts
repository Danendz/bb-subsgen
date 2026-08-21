import { describe, expect, test } from 'vitest'
import { buildLexiconText, groupByHeadword, parseCedictLine } from './cedict'

describe('parseCedictLine', () => {
  test('parses a well-formed line', () => {
    expect(parseCedictLine('喜歡 喜欢 [xi3 huan5] /to like/to be fond of/')).toEqual({
      traditional: '喜歡',
      simplified: '喜欢',
      pinyin: 'xi3 huan5',
      definitions: ['to like', 'to be fond of'],
    })
  })

  test('skips a comment line — CC-CEDICT opens with pages of them', () => {
    expect(parseCedictLine('# CC-CEDICT')).toBeNull()
  })

  test('skips a malformed line rather than throwing', () => {
    expect(parseCedictLine('not a cedict line at all')).toBeNull()
  })

  test('normalizes u: to ü, the CC-CEDICT escape for characters outside plain ASCII', () => {
    expect(parseCedictLine('女 女 [nu:3] /woman/female/')?.pinyin).toBe('nü3')
  })

  test('reads a line that still has its CR — the download is split on LF alone', () => {
    // MDBG ships CRLF: 124,911 lines and 124,911 CR bytes, with no terminator
    // on the last one. install.ts splits the stream on '\n', so every line but
    // that last arrives with a trailing '\r', and the anchored LINE_RE rejected
    // all of them — an install that reported success with an entryCount of 1
    // and left the overlay with no pinyin and no glosses.
    expect(parseCedictLine('喜歡 喜欢 [xi3 huan5] /to like/to be fond of/\r')).toEqual({
      traditional: '喜歡',
      simplified: '喜欢',
      pinyin: 'xi3 huan5',
      definitions: ['to like', 'to be fond of'],
    })
  })

  test('skips the blank line a CRLF split leaves behind', () => {
    expect(parseCedictLine('\r')).toBeNull()
  })
})

describe('groupByHeadword', () => {
  test('keys an entry under both its simplified and traditional form', () => {
    const entry = parseCedictLine('喜歡 喜欢 [xi3 huan5] /to like/')!
    const grouped = groupByHeadword([entry])
    expect(grouped.get('喜欢')).toEqual([entry])
    expect(grouped.get('喜歡')).toEqual([entry])
  })
})

describe('buildLexiconText', () => {
  test('writes headword, pinyin and no flag for an ordinary word', () => {
    // A single character avoids the simplified/traditional split, so there is
    // exactly one lexicon line to assert on.
    const entry = parseCedictLine('喜 喜 [xi3] /to be fond of/')!
    expect(buildLexiconText(groupByHeadword([entry]))).toBe('喜\txi3')
  })

  test('carries the \\tp flag for a phrasebook entry into the lexicon text', () => {
    // A capitalized, terminally-punctuated gloss is what excludeFromSegmentation
    // treats as a phrase rather than a word — see lang/entries.ts.
    const entry = parseCedictLine('得意 得意 [de2 yi4] /How are you getting by?/')!
    expect(buildLexiconText(groupByHeadword([entry]))).toBe('得意\tde2 yi4\tp')
  })
})
