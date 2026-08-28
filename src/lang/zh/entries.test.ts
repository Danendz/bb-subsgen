import { describe, expect, test } from 'vitest'
import type { Entry } from '../pack'
import { readingText } from '../reading'
import type { CedictRow } from './cedict-row'
import { readingParts } from './reading'
import { bestRow, entriesFrom, excludeFromSegmentation, isPhrase, rank } from './entries'

/**
 * Rows in, ranked entries out — the path a hover actually takes.
 *
 * The fixtures below stay in CC-CEDICT's own shape rather than being written
 * as `Entry` literals, so these cases keep proving the conversion as well as
 * the ranking.
 */
function ranked(
  rows: CedictRow[],
  headword: string,
  displayedReading?: string,
  traditional = false,
): Entry[] {
  return rank(entriesFrom(rows, headword, { traditional }), headword, displayedReading)
}

function entry(pinyin: string, ...definitions: string[]): Entry {
  const rows: CedictRow[] = [{ traditional: '', simplified: '', pinyin, definitions }]
  return entriesFrom(rows, '', { traditional: false })[0]
}

/** The first gloss, which is what every ranking case below is checking. */
const topGloss = (entries: Entry[]): string => entries[0].senses[0].gloss

// The real CC-CEDICT shape for 和, in file order. The variant entry keyed
// under 咊 precedes the canonical one, which is why "first wins" showed
// "old variant of 和".
const HE: CedictRow[] = [
  { traditional: '咊', simplified: '和', pinyin: 'he2', definitions: ['old variant of 和[he2]'] },
  { traditional: '和', simplified: '和', pinyin: 'He2', definitions: ['surname He'] },
  {
    traditional: '和',
    simplified: '和',
    pinyin: 'he2',
    definitions: ['(joining two nouns) and; together with; with'],
  },
  {
    traditional: '和',
    simplified: '和',
    pinyin: 'he4',
    definitions: ['to compose a poem in reply'],
  },
  {
    traditional: '龢',
    simplified: '和',
    pinyin: 'he2',
    definitions: ['(literary) harmonious (variant of 和[he2])'],
  },
]

describe('rank', () => {
  test('prefers the canonical entry over a variant that appears first', () => {
    expect(topGloss(ranked(HE, '和', 'hé'))).toContain('together with')
  })

  test('prefers the entry matching the reading shown on the subtitle', () => {
    expect(topGloss(ranked(HE, '和', 'hè'))).toBe('to compose a poem in reply')
  })

  test('deprioritizes a surname reading when no reading is displayed', () => {
    expect(topGloss(ranked(HE, '和'))).toContain('together with')
  })

  test('keeps every entry, only reordering them', () => {
    expect(ranked(HE, '和', 'hé')).toHaveLength(HE.length)
  })

  test('prefers the traditional form when reading traditional text', () => {
    const rows: CedictRow[] = [
      { traditional: '龍', simplified: '龙', pinyin: 'long2', definitions: ['dragon'] },
      {
        traditional: '竜',
        simplified: '龙',
        pinyin: 'long2',
        definitions: ['variant of 龍[long2]'],
      },
    ]
    expect(topGloss(ranked(rows, '龍', 'lóng', true))).toBe('dragon')
  })

  test('returns an empty array for no entries', () => {
    expect(ranked([], '和', 'hé')).toEqual([])
  })

  // Where nothing else separates two readings of a character, file order decided
  // — and CC-CEDICT is sorted by reading, so the rare one often sorts first.
  // 说 was published as `shui4` ("to persuade"), 跑 as `pao2` ("to paw the
  // ground"), and both readings went into words.bin and onto the screen.
  test('prefers the reading carrying more senses when nothing else separates them', () => {
    const shuo: CedictRow[] = [
      { traditional: '說', simplified: '说', pinyin: 'shui4', definitions: ['to persuade'] },
      {
        traditional: '說',
        simplified: '说',
        pinyin: 'shuo1',
        definitions: ['to speak; to talk; to say', 'to explain', 'to scold', 'theory; doctrine'],
      },
    ]

    expect(readingText(ranked(shuo, '说')[0].reading)).toBe('shuō')
  })

  test('lets sense count break a tie without outvoting the displayed reading', () => {
    const pao: CedictRow[] = [
      { traditional: '跑', simplified: '跑', pinyin: 'pao2', definitions: ['to paw the ground'] },
      {
        traditional: '跑',
        simplified: '跑',
        pinyin: 'pao3',
        definitions: ['to run', 'to escape', 'to run around', 'to leak'],
      },
    ]

    // Asked for páo explicitly, pao2 still wins — sense count is a tiebreak,
    // not a veto over what is actually printed above the character.
    expect(readingText(ranked(pao, '跑', 'páo')[0].reading)).toBe('páo')
    expect(readingText(ranked(pao, '跑')[0].reading)).toBe('pǎo')
  })
})

// 啊 as CC-CEDICT actually publishes it, in file order.
const A: CedictRow[] = [
  {
    traditional: '啊',
    simplified: '啊',
    pinyin: 'a1',
    definitions: ['interjection of surprise', 'Ah!', 'Oh!'],
  },
  {
    traditional: '啊',
    simplified: '啊',
    pinyin: 'a2',
    definitions: ['interjection expressing doubt', 'Eh?'],
  },
  {
    traditional: '啊',
    simplified: '啊',
    pinyin: 'a3',
    definitions: ['interjection of surprise or doubt', 'My!'],
  },
  {
    traditional: '啊',
    simplified: '啊',
    pinyin: 'a4',
    definitions: ['grunt of agreement', 'uhm', 'Ah, OK', "Oh, it's you!"],
  },
  {
    traditional: '啊',
    simplified: '啊',
    pinyin: 'a5',
    definitions: ['modal particle ending sentence, showing affirmation, approval, or consent'],
  },
]

describe('the sense a reading selects', () => {
  /**
   * The 啊 in 那时间过得很快啊 was glossed "interjection of surprise".
   *
   * Nothing here was wrong. `rank` scores the displayed reading above
   * every other signal, which is correct — it is just that the reading it was
   * shown was `ā`, chosen at build time with no sentence in front of it. Given
   * the neutral `a` the same function picks the sentence-final particle unaided, which is
   * why closing this defect took no change to entries.ts at all.
   */
  test('picks the sentence-final particle once the reading is the neutral a', () => {
    expect(topGloss(ranked(A, '啊', 'a'))).toContain('modal particle')
  })

  test('still picks the interjection when the reading really is ā', () => {
    expect(topGloss(ranked(A, '啊', 'ā'))).toContain('surprise')
  })
})

describe('isPhrase', () => {
  // 过得 is why this exists. CC-CEDICT documents it as a phrasebook line, but
  // greedy segmentation happily consumed it out of 时间过得很快, which both
  // stranded the real parse and printed `guo4 de2` over a structural particle.
  test('treats a headword glossed as a whole sentence as a phrase', () => {
    const guode = entry(
      'guo4 de2',
      'How are you getting by?',
      "How's life?",
      'contraction of 過得去|过得去, can get by',
      'tolerably well',
    )
    expect(isPhrase(guode)).toBe(true)
  })

  // The rule has to survive 什么, which glosses as "what?" — a question mark is
  // not evidence of a sentence, or the most common word in the language would
  // stop being a segmentation candidate.
  test('keeps a word whose senses are lowercase question glosses', () => {
    expect(isPhrase(entry('shen2 me5', 'what?', 'who?', 'something', 'anything'))).toBe(false)
  })

  // Capitalization alone is not evidence either: CC-CEDICT capitalizes every
  // proper noun, and 北京 has to keep segmenting.
  test('keeps a proper noun, which is capitalized but not a sentence', () => {
    expect(isPhrase(entry('Bei3 jing1', 'Beijing, capital of China'))).toBe(false)
  })

  // The narrow rule matters most here: 觉得 also ends in 得 and is also a real
  // word. Only the gloss distinguishes it from 过得.
  test('keeps an ordinary verb that happens to end in a particle character', () => {
    expect(isPhrase(entry('jue2 de5', 'to think', 'to feel'))).toBe(false)
  })
})

describe('excludeFromSegmentation', () => {
  test('excludes anything isPhrase already rejects', () => {
    const guode = entry('guo4 de2', 'How are you getting by?')
    expect(excludeFromSegmentation(guode, '过得')).toBe(true)
  })

  // 我去 is a genuine CC-CEDICT headword — internet slang, "what the ...!" — and
  // no rule derived from the entry can tell that it is a far worse reading of
  // those two characters than 我 + 去. Only frequency separates them, and this
  // extension deliberately ships no frequency list, so the handful of headwords
  // in this position are named outright.
  test('excludes real words that are much more often two words', () => {
    const woqu = entry('wo3 qu4', '(slang) what the ...!; oh my god!')
    expect(excludeFromSegmentation(woqu, '我去')).toBe(true)
  })

  // The blunt version of this rule — "penalise anything starting with a
  // pronoun" — takes 你好 with it, which is why the exclusions are named rather
  // than inferred.
  test('leaves ordinary words that begin with a pronoun alone', () => {
    expect(excludeFromSegmentation(entry('ni3 hao3', 'hello'), '你好')).toBe(false)
    expect(excludeFromSegmentation(entry('wo3 men5', 'we; us'), '我们')).toBe(false)
  })
})

describe('entriesFrom', () => {
  const you: CedictRow[] = [
    {
      traditional: '朋友',
      simplified: '朋友',
      pinyin: 'peng2 you5',
      definitions: ['friend', 'CL:個|个[ge4],位[wei4]'],
    },
  ]

  test('keeps a measure word as a tag, so the card can still tone-colour it', () => {
    const [entry] = entriesFrom(you, '朋友', { traditional: false })
    expect(entry.tags).toEqual([
      { kind: 'classifier', word: '个', reading: readingParts('个', 'ge4') },
      { kind: 'classifier', word: '位', reading: readingParts('位', 'wei4') },
    ])
  })

  // The standalone `CL:` form is the common one and leaves nothing to gloss, so
  // a classifier attached to a sense would have been dropped for exactly the
  // words that have one.
  test('does not turn a bare CL line into a sense', () => {
    const [entry] = entriesFrom(you, '朋友', { traditional: false })
    expect(entry.senses.map((sense) => sense.gloss)).toEqual(['friend'])
  })

  test('writes the headword and its measure word in the script that was asked for', () => {
    const [entry] = entriesFrom(you, '朋友', { traditional: true })
    expect(entry.headword).toBe('朋友')
    expect(entry.tags).toContainEqual({
      kind: 'classifier',
      word: '個',
      reading: readingParts('個', 'ge4'),
    })
  })

  test('rewrites a cross-reference into the same script as the rest of the card', () => {
    const rows: CedictRow[] = [
      {
        traditional: '信用卡',
        simplified: '信用卡',
        pinyin: 'xin4 yong4 ka3',
        definitions: ['see also 信用證|信用证[xin4 yong4 zheng4]'],
      },
    ]
    expect(entriesFrom(rows, '信用卡', { traditional: false })[0].senses[0].gloss).toBe(
      'see also 信用证 (xìn yòng zhèng)',
    )
    expect(entriesFrom(rows, '信用卡', { traditional: true })[0].senses[0].gloss).toBe(
      'see also 信用證 (xìn yòng zhèng)',
    )
  })

  test('names the other script as a variant, and nothing when the two agree', () => {
    const rows: CedictRow[] = [
      { traditional: '龍', simplified: '龙', pinyin: 'long2', definitions: ['dragon'] },
      { traditional: '和', simplified: '和', pinyin: 'he2', definitions: ['and'] },
    ]
    const [dragon, he] = entriesFrom(rows, '龙', { traditional: false })
    expect(dragon.variants).toEqual(['龍'])
    expect(he.variants).toEqual([])
  })

  // Rows come back from IndexedDB typed `unknown`, written by whichever install
  // ran last. A card with no definition beats an exception inside a hover.
  test('drops a stored row it cannot read rather than throwing on it', () => {
    expect(
      entriesFrom([null, 'nonsense', { pinyin: 'he2' }], '和', { traditional: false }),
    ).toEqual([])
  })
})

describe('bestRow', () => {
  // The lexicon stores CC-CEDICT's own `ye3` notation, which `Entry.reading`
  // has thrown away — so the winning entry has to be paired back to the row it
  // came from. If `rank` ever starts returning new objects, this is the test
  // that fails instead of every reading in the dictionary quietly going wrong.
  test('gives back the row the winning entry was built from, not a copy', () => {
    const ye: CedictRow[] = [
      { traditional: '也', simplified: '也', pinyin: 'Ye3', definitions: ['surname Ye'] },
      { traditional: '也', simplified: '也', pinyin: 'ye3', definitions: ['also; too'] },
    ]
    const { row, entry } = bestRow(ye, '也')
    expect(row).toBe(ye[1])
    expect(row.pinyin).toBe('ye3')
    expect(entry.senses[0].gloss).toBe('also; too')
  })

  test('demotes the surname CC-CEDICT lists first, which is why 过 read Guo1', () => {
    const guo: CedictRow[] = [
      { traditional: '過', simplified: '过', pinyin: 'Guo1', definitions: ['surname Guo'] },
      {
        traditional: '過',
        simplified: '过',
        pinyin: 'guo4',
        definitions: ['to cross', 'to pass', 'to go over'],
      },
    ]
    expect(bestRow(guo, '过').row.pinyin).toBe('guo4')
  })

  test('takes the reading the function-word table declares over the one ranking would pick', () => {
    const de: CedictRow[] = [
      { traditional: '得', simplified: '得', pinyin: 'de2', definitions: ['to obtain', 'to get'] },
      { traditional: '得', simplified: '得', pinyin: 'de5', definitions: ['structural particle'] },
    ]
    expect(bestRow(de, '得', 'de').row.pinyin).toBe('de5')
  })
})
