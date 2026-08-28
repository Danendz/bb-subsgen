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
  '行く\tいく\tv5k-s',
  '言う\tいう\tv5u',
  '飲む\tのむ\tv5m',
  '書く\tかく\tv5k',
  '勉強\tべんきょう\tvs',
  'ありがとう\tありがとう',
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

  test('takes an inflected verb whole, and says which headword it is a form of', () => {
    // The reason the whole port exists. Before the candidate loop this was one
    // unmatched run — an honest "not a headword", and useless to a learner, who
    // does not meet 食べる on a page and does meet 食べました.
    expect(cut('食べました')).toEqual(['食べました'])
    const [word] = lexicon.segment('食べました')
    expect(word.kind).toBe('content')
    expect(word.dictionary).toBe('食べる')
  })

  test('leaves `dictionary` off a word that is already its own headword', () => {
    // Absent rather than equal to `text`, so a caller reading
    // `dictionary ?? text` never has to ask whether the two agree.
    expect(lexicon.segment('食べる')[0].dictionary).toBeUndefined()
  })

  // Both are real past tenses of real verbs and the table offers both spellings
  // for either surface. Rule order does not decide this — only the class the
  // lexicon recorded does, which is what `index.classes` was written for.
  test('separates 行った from 言った by class, since the table cannot', () => {
    expect(lexicon.segment('行った')[0].dictionary).toBe('行く')
    expect(lexicon.segment('言った')[0].dictionary).toBe('言う')
  })

  // 行つ is a `v5t` word the table offers and the dictionary has never heard of.
  // Without the class check it would be taken, and the card would gloss a verb
  // that does not exist.
  test('never takes a candidate the lexicon does not hold at the claimed class', () => {
    expect(lexicon.segment('行った')[0].dictionary).not.toBe('行つ')
  })

  test('files a する compound under the noun, which is the headword JMdict has', () => {
    expect(lexicon.segment('勉強した')[0].dictionary).toBe('勉強')
  })

  test('draws furigana over the kanji of the surface, not of the headword', () => {
    // たべる over 食べて would be furigana for a word that is not on the page.
    // The swap is the headword's reading with the suffix put back: たべる − る
    // + て.
    expect(lexicon.segment('食べて')[0].reading).toEqual([
      { base: '食', text: 'た', tone: null },
      { base: 'べて', text: '', tone: null },
    ])
    expect(lexicon.segment('飲んだ')[0].reading).toEqual([
      { base: '飲', text: 'の', tone: null },
      { base: 'んだ', text: '', tone: null },
    ])
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
