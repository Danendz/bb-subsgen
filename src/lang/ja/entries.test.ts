import { describe, expect, test } from 'vitest'
import { entriesFrom, lexiconFacts, rank } from './entries'
import type { JmdictKana, JmdictKanji, JmdictRow, JmdictSense } from './jmdict-row'

const kanji = (text: string, extra: Partial<JmdictKanji> = {}): JmdictKanji => ({
  text,
  common: false,
  tags: [],
  ...extra,
})
const kana = (text: string, extra: Partial<JmdictKana> = {}): JmdictKana => ({
  text,
  common: false,
  tags: [],
  restrictedTo: [],
  nokanji: false,
  ...extra,
})
const sense = (gloss: string, extra: Partial<JmdictSense> = {}): JmdictSense => ({
  pos: [],
  misc: [],
  field: [],
  info: [],
  gloss: [gloss],
  ...extra,
})
const row = (extra: Partial<JmdictRow> = {}): JmdictRow => ({
  kanji: [],
  kana: [],
  senses: [],
  ...extra,
})

const glosses = (rows: JmdictRow[], headword: string, reading?: string) =>
  rank(entriesFrom(rows, headword, { traditional: false }), headword, reading).map(
    (entry) => entry.senses[0]?.gloss,
  )

// 生 is the case #13 named: two readings, two entries, one spelling. せい is
// listed as the common one and has more to say, so it wins on every signal a
// row carries — and it is still the wrong answer over a word read なま.
const NAMA = row({
  kanji: [kanji('生')],
  kana: [kana('なま')],
  senses: [sense('raw'), sense('uncooked')],
})
const SEI = row({
  kanji: [kanji('生', { common: true })],
  kana: [kana('せい', { common: true })],
  senses: [sense('life'), sense('student'), sense('birth')],
})

describe('rank', () => {
  test('the reading on screen beats every signal the dictionary has', () => {
    expect(glosses([SEI, NAMA], '生')).toEqual(['life', 'raw'])
    expect(glosses([SEI, NAMA], '生', 'なま')).toEqual(['raw', 'life'])
  })

  test('a katakana reading and a hiragana one are the same sounds written twice', () => {
    // 猫 is routinely written ネコ, and the reading JMdict stores is ねこ. A
    // learner who sees one must not be handed a card ranked as if they saw
    // something else.
    const neko = row({ kanji: [kanji('猫')], kana: [kana('ねこ')], senses: [sense('cat')] })
    const inu = row({ kanji: [kanji('猫')], kana: [kana('びょう')], senses: [sense('feline')] })
    expect(glosses([inu, neko], '猫', 'ネコ')).toEqual(['cat', 'feline'])
  })

  test('leaves the order alone when nothing on screen says otherwise', () => {
    const entries = entriesFrom([SEI, NAMA], '生', { traditional: false })
    expect(rank(entries, '生')).toEqual(entries)
  })
})

describe('entriesFrom', () => {
  test('a rare spelling loses to the ordinary one, whatever it has to say', () => {
    const ordinary = row({
      kanji: [kanji('幸せ', { common: true })],
      kana: [kana('しあわせ', { common: true })],
      senses: [sense('happiness')],
    })
    const rare = row({
      kanji: [kanji('幸せ', { tags: ['rK'] })],
      kana: [kana('さきわい')],
      senses: [sense('blessing'), sense('grace'), sense('favour')],
    })
    expect(glosses([rare, ordinary], '幸せ')).toEqual(['happiness', 'blessing'])
  })

  test('a name ranks below a word, because a surname is rarely what was meant', () => {
    const word = row({ kanji: [kanji('森')], kana: [kana('もり')], senses: [sense('forest')] })
    const name = row({
      kanji: [kanji('森')],
      kana: [kana('しん')],
      senses: [sense('Shin', { misc: ['surname'] })],
    })
    expect(glosses([name, word], '森')).toEqual(['forest', 'Shin'])
  })

  test('draws furigana over the kanji and nothing over the kana', () => {
    const taberu = row({
      kanji: [kanji('食べる', { common: true })],
      kana: [kana('たべる', { common: true })],
      senses: [sense('to eat')],
    })
    expect(entriesFrom([taberu], '食べる', { traditional: false })[0].reading).toEqual([
      { base: '食', text: 'た', tone: null },
      { base: 'べる', text: '', tone: null },
    ])
  })

  test('never reads a spelling with a reading restricted away from it', () => {
    // 仕合わせ may be read しやわせ; 幸せ may not, and one entry holds both.
    const both = row({
      kanji: [kanji('幸せ', { common: true }), kanji('仕合わせ')],
      kana: [kana('しあわせ', { common: true }), kana('しやわせ', { restrictedTo: ['仕合わせ'] })],
      senses: [sense('happiness')],
    })
    expect(lexiconFacts([both], '幸せ').reading).toBe('しあわせ')
  })

  test('a nokanji reading belongs to no spelling, not to all of them', () => {
    const neko = row({
      kanji: [kanji('猫', { common: true })],
      kana: [kana('ネコ', { nokanji: true })],
      senses: [sense('cat')],
    })
    expect(lexiconFacts([neko], '猫').reading).toBe('')
  })

  test('a stale row from some other install is a card with no definition, not a throw', () => {
    expect(
      entriesFrom([{ simplified: '生', pinyin: 'sheng1' }], '生', { traditional: false }),
    ).toEqual([])
  })

  test('the other spellings become variants; the reading never does', () => {
    const both = row({
      kanji: [kanji('幸せ', { common: true }), kanji('仕合わせ')],
      kana: [kana('しあわせ', { common: true })],
      senses: [sense('happiness')],
    })
    expect(entriesFrom([both], '幸せ', { traditional: false })[0].variants).toEqual(['仕合わせ'])
    expect(entriesFrom([both], 'しあわせ', { traditional: false })[0].variants).toEqual([
      '幸せ',
      '仕合わせ',
    ])
  })
})

describe('lexiconFacts', () => {
  test('a kana headword reads as itself — there is nothing to draw above it', () => {
    const kudasai = row({ kana: [kana('ください', { common: true })], senses: [sense('please')] })
    expect(lexiconFacts([kudasai], 'ください')).toEqual({ reading: 'ください', flags: [] })
  })

  test('carries the word class, which is read inside a segmenter that cannot await', () => {
    const taberu = row({
      kanji: [kanji('食べる', { common: true })],
      kana: [kana('たべる', { common: true })],
      senses: [sense('to eat', { pos: ['v1', 'vt'] })],
    })
    expect(lexiconFacts([taberu], '食べる').flags).toEqual(['v1'])
  })

  test('a spelling rare in one entry and current in another is not rare', () => {
    const rare = row({
      kanji: [kanji('生', { tags: ['rK'] })],
      kana: [kana('き')],
      senses: [sense('pure')],
    })
    expect(lexiconFacts([rare, NAMA], '生').flags).toEqual([])
    expect(lexiconFacts([rare], '生').flags).toEqual(['r'])
  })

  test('an entry archaic in every sense is one the segmenter must not take', () => {
    const archaic = row({
      kanji: [kanji('御坐る')],
      kana: [kana('おわす')],
      senses: [sense('to be', { misc: ['arch'] })],
    })
    expect(lexiconFacts([archaic], '御坐る').flags).toEqual(['r'])
  })
})
