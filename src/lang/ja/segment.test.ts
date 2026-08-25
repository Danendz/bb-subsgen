import { describe, expect, test } from 'vitest'
import { loadJapanese } from './lexicon'
import { japanesePack } from './pack'

const LEXICON = [
  '猫\tねこ',
  'ねこ\tねこ',
  'が\tが',
  '好き\tすき',
  '食べる\tたべる\tv1',
  'ください\tください',
  '茲\tここ\tr',
  'ここ\tここ',
].join('\n')

const lexicon = loadJapanese(LEXICON, japanesePack)
const cut = (text: string) => lexicon.segment(text).map((token) => token.text)

describe('segment', () => {
  test('takes the longest word it can, then carries on from the end of it', () => {
    expect(cut('猫が好き')).toEqual(['猫', 'が', '好き'])
  })

  test('a kana-only word is found rather than run past', () => {
    // A segmenter that only looked for kanji would read ください as three
    // characters of nothing, which is most of what a learner is stuck on.
    expect(cut('ください')).toEqual(['ください'])
  })

  test('never claims a span with a rare spelling, though the lexicon still holds it', () => {
    // 茲 is a real entry and a real hover. It is also almost never the right cut
    // — the same separation the `p` flag gives Chinese phrasebook entries.
    expect(cut('茲')).toEqual(['茲'])
    expect(lexicon.segment('茲')[0].kind).toBe('other')
    expect(lexicon.has('茲')).toBe(true)
  })

  test('an inflected verb is one unmatched run, not the word it inflects', () => {
    // 食べました is 食べる, and nothing here knows that: deinflection is #15's
    // table and #17 is what hangs the candidate loop off this match. Until then
    // the honest answer is one token saying "not a headword" rather than a
    // confident 食 followed by wreckage.
    expect(cut('食べました')).toEqual(['食べました'])
    expect(cut('食べる')).toEqual(['食べる'])
  })

  test('keeps the Latin and the punctuation as they were', () => {
    expect(cut('猫、OK')).toEqual(['猫', '、OK'])
  })

  test('a matched word carries its furigana; an unmatched run carries no reading', () => {
    const [neko, rest] = lexicon.segment('猫だ')
    expect(neko).toEqual({
      text: '猫',
      reading: [{ base: '猫', text: 'ねこ', tone: null }],
      kind: 'content',
    })
    expect(rest.reading).toBeNull()
  })
})
