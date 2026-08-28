import { describe, expect, test } from 'vitest'
import { headwordsOf, jmdictParser, parseJmdictEntry } from './jmdict'
import type { JmdictRow } from '../lang/ja/jmdict-row'

/** Real entries, trimmed to the elements this parser reads. */
const ENTRIES = {
  taberu: `<entry>
<ent_seq>1358280</ent_seq>
<k_ele><keb>食べる</keb><ke_pri>ichi1</ke_pri><ke_pri>news1</ke_pri><ke_pri>nf05</ke_pri></k_ele>
<r_ele><reb>たべる</reb><re_pri>ichi1</re_pri><re_pri>news1</re_pri></r_ele>
<sense><pos>&v1;</pos><pos>&vt;</pos><gloss>to eat</gloss><gloss>to live on</gloss></sense>
</entry>`,
  shiawase: `<entry>
<k_ele><keb>幸せ</keb><ke_pri>ichi1</ke_pri></k_ele>
<k_ele><keb>仕合わせ</keb><ke_inf>&rK;</ke_inf></k_ele>
<r_ele><reb>しあわせ</reb><re_pri>ichi1</re_pri></r_ele>
<r_ele><reb>しやわせ</reb><re_restr>仕合わせ</re_restr><re_inf>&ok;</re_inf></r_ele>
<sense><pos>&n;</pos><pos>&adj-na;</pos><gloss>happiness</gloss><gloss>good fortune</gloss></sense>
</entry>`,
  kudasai: `<entry>
<r_ele><reb>ください</reb><re_pri>ichi1</re_pri></r_ele>
<sense><pos>&exp;</pos><misc>&uk;</misc><gloss>please (give me)</gloss></sense>
</entry>`,
  koko: `<entry>
<k_ele><keb>茲</keb><ke_inf>&rK;</ke_inf></k_ele>
<r_ele><reb>ここ</reb></r_ele>
<sense><pos>&pn;</pos><gloss>here</gloss></sense>
</entry>`,
  kenkyu: `<entry>
<k_ele><keb>研究開発</keb></k_ele>
<r_ele><reb>けんきゅうかいはつ</reb></r_ele>
<sense><pos>&n;</pos><gloss>research &amp; development</gloss></sense>
</entry>`,
  neko: `<entry>
<k_ele><keb>猫</keb><ke_pri>ichi1</ke_pri></k_ele>
<r_ele><reb>ねこ</reb><re_pri>ichi1</re_pri></r_ele>
<r_ele><reb>ネコ</reb><re_nokanji/></r_ele>
<sense><pos>&n;</pos><gloss>cat</gloss></sense>
</entry>`,
}

const parse = (xml: string): JmdictRow => {
  const row = parseJmdictEntry(xml)
  if (!row) throw new Error('entry did not parse')
  return row
}

describe('parseJmdictEntry', () => {
  test('reads part of speech off the entity ref, since no DTD is shipped', () => {
    // JMdict writes `&v1;` against its own internal DTD. Stripping the & and the
    // ; is what makes the codes match the ones jmdict-simplified publishes.
    expect(parse(ENTRIES.taberu).senses[0].pos).toEqual(['v1', 'vt'])
  })

  test('a priority band is one boolean by the time it is stored', () => {
    expect(parse(ENTRIES.taberu).kanji[0]).toEqual({
      text: '食べる',
      common: true,
      tags: [],
    })
  })

  test('keeps the spellings a reading is restricted to, so furigana lands on the right one', () => {
    // Without re_restr, しやわせ is a candidate reading for 幸せ — and a wrong
    // reading drawn confidently over a word is worse than none.
    const kana = parse(ENTRIES.shiawase).kana
    expect(kana.map((entry) => entry.restrictedTo)).toEqual([[], ['仕合わせ']])
    expect(kana[1].tags).toEqual(['ok'])
  })

  test('a rare spelling keeps its ke_inf, which is what stops it claiming a span', () => {
    expect(parse(ENTRIES.koko).kanji[0].tags).toEqual(['rK'])
  })

  test('re_nokanji is not an empty restriction — it belongs to no spelling at all', () => {
    const neko = parse(ENTRIES.neko).kana
    expect(neko.map((entry) => entry.nokanji)).toEqual([false, true])
  })

  test('a kana-only entry has no spelling and is still a headword', () => {
    const row = parse(ENTRIES.kudasai)
    expect(row.kanji).toEqual([])
    expect(headwordsOf(row)).toEqual(['ください'])
  })

  test('unescapes the predefined entities in gloss text, and only there', () => {
    expect(parse(ENTRIES.kenkyu).senses[0].gloss).toEqual(['research & development'])
  })

  test('the DTD preamble is not an entry', () => {
    expect(
      parseJmdictEntry('<?xml version="1.0"?>\n<!DOCTYPE JMdict [\n<!ENTITY n "noun">\n]>'),
    ).toBeNull()
  })
})

describe('headwordsOf', () => {
  test('indexes every spelling and every reading', () => {
    // 41,195 of JMdict's entries are kana-only, and a learner hovering a word
    // on a page is as often hovering its reading as its spelling.
    expect(headwordsOf(parse(ENTRIES.shiawase))).toEqual([
      '幸せ',
      '仕合わせ',
      'しあわせ',
      'しやわせ',
    ])
  })
})

describe('jmdictParser', () => {
  const feed = (...chunks: string[]) => {
    const parser = jmdictParser()
    for (const chunk of chunks) parser.push(chunk)
    return parser
  }

  test('one row is shared by reference across the keys it is found under', () => {
    // 218,607 entries key 465,168 headwords. Copying the row per key is the
    // difference between an import that fits in memory and one that does not.
    const map = feed(ENTRIES.shiawase).finish()
    expect(map.get('幸せ')?.[0]).toBe(map.get('しあわせ')?.[0])
  })

  test('an entry split mid-tag across two chunks parses as one entry', () => {
    // The case the push/finish shape exists for: the network decides where the
    // chunks fall, and it does not fall on record boundaries.
    const whole = ENTRIES.taberu
    const cut = whole.indexOf('<reb>') + 3
    const map = feed(whole.slice(0, cut), whole.slice(cut)).finish()
    expect(map.get('食べる')?.[0].kana[0].text).toBe('たべる')
  })

  test('reads a run of entries, ignoring the DTD in front of them', () => {
    const document = `<?xml version="1.0"?>\n<!DOCTYPE JMdict [<!ENTITY n "noun">]>\n<JMdict>\n${ENTRIES.taberu}\n${ENTRIES.kudasai}\n</JMdict>`
    const map = feed(document).finish()
    expect([...map.keys()].sort()).toEqual(['ください', 'たべる', '食べる'])
  })

  test('writes a reading the hover card will agree with, not the first one listed', () => {
    const parser = feed(ENTRIES.shiawase)
    const lines = parser.lexiconText(parser.finish()).split('\n')
    expect(lines).toContain('幸せ\tしあわせ')
    expect(lines).toContain('しやわせ\tしやわせ\tr')
  })

  test('writes the word class the segmenter will need, because the lexicon is written once', () => {
    // #15 deinflects inside the segmenter, which is synchronous over this text.
    // Adding the field later would cost every Japanese user a re-download.
    const parser = feed(ENTRIES.taberu)
    expect(parser.lexiconText(parser.finish())).toContain('食べる\tたべる\tv1')
  })

  test('flags a spelling that is rare in every entry it appears in', () => {
    const parser = feed(ENTRIES.koko)
    const lines = parser.lexiconText(parser.finish()).split('\n')
    expect(lines).toContain('茲\tここ\tr')
    // The reading is not rare just because the spelling is — ここ is the
    // ordinary word, and it must still segment.
    expect(lines).toContain('ここ\tここ')
  })
})
