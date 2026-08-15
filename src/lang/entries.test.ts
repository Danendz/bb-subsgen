import { describe, expect, test } from 'vitest'
import { excludeFromSegmentation, isPhrase, rankEntries } from './entries'
import type { CedictEntry } from './dict'

function entry(pinyin: string, ...definitions: string[]): CedictEntry {
  return { traditional: '', simplified: '', pinyin, definitions }
}

// The real CC-CEDICT shape for 和, in file order. The variant entry keyed
// under 咊 precedes the canonical one, which is why "first wins" showed
// "old variant of 和".
const HE: CedictEntry[] = [
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

describe('rankEntries', () => {
  test('prefers the canonical entry over a variant that appears first', () => {
    const [primary] = rankEntries(HE, '和', 'he2')
    expect(primary.definitions[0]).toContain('together with')
  })

  test('prefers the entry matching the reading shown on the subtitle', () => {
    const [primary] = rankEntries(HE, '和', 'he4')
    expect(primary.definitions[0]).toBe('to compose a poem in reply')
  })

  test('deprioritizes a surname reading when no reading is displayed', () => {
    const [primary] = rankEntries(HE, '和')
    expect(primary.definitions[0]).toContain('together with')
  })

  test('keeps every entry, only reordering them', () => {
    expect(rankEntries(HE, '和', 'he2')).toHaveLength(HE.length)
  })

  test('prefers the traditional form when reading traditional text', () => {
    const entries: CedictEntry[] = [
      { traditional: '龍', simplified: '龙', pinyin: 'long2', definitions: ['dragon'] },
      { traditional: '竜', simplified: '龙', pinyin: 'long2', definitions: ['variant of 龍[long2]'] },
    ]
    const [primary] = rankEntries(entries, '龍', 'long2', true)
    expect(primary.definitions[0]).toBe('dragon')
  })

  test('returns an empty array for no entries', () => {
    expect(rankEntries([], '和', 'he2')).toEqual([])
  })

  // Where nothing else separates two readings of a character, file order decided
  // — and CC-CEDICT is sorted by reading, so the rare one often sorts first.
  // 说 was published as `shui4` ("to persuade"), 跑 as `pao2` ("to paw the
  // ground"), and both readings went into words.bin and onto the screen.
  test('prefers the reading carrying more senses when nothing else separates them', () => {
    const shuo: CedictEntry[] = [
      { traditional: '說', simplified: '说', pinyin: 'shui4', definitions: ['to persuade'] },
      {
        traditional: '說',
        simplified: '说',
        pinyin: 'shuo1',
        definitions: ['to speak; to talk; to say', 'to explain', 'to scold', 'theory; doctrine'],
      },
    ]

    expect(rankEntries(shuo, '说')[0].pinyin).toBe('shuo1')
  })

  test('lets sense count break a tie without outvoting the displayed reading', () => {
    const pao: CedictEntry[] = [
      { traditional: '跑', simplified: '跑', pinyin: 'pao2', definitions: ['to paw the ground'] },
      {
        traditional: '跑',
        simplified: '跑',
        pinyin: 'pao3',
        definitions: ['to run', 'to escape', 'to run around', 'to leak'],
      },
    ]

    // Asked for pao2 explicitly, pao2 still wins — sense count is a tiebreak,
    // not a veto over what is actually printed above the character.
    expect(rankEntries(pao, '跑', 'pao2')[0].pinyin).toBe('pao2')
    expect(rankEntries(pao, '跑')[0].pinyin).toBe('pao3')
  })
})

// 啊 as CC-CEDICT actually publishes it, in file order.
const A: CedictEntry[] = [
  { traditional: '啊', simplified: '啊', pinyin: 'a1', definitions: ['interjection of surprise', 'Ah!', 'Oh!'] },
  { traditional: '啊', simplified: '啊', pinyin: 'a2', definitions: ['interjection expressing doubt', 'Eh?'] },
  { traditional: '啊', simplified: '啊', pinyin: 'a3', definitions: ['interjection of surprise or doubt', 'My!'] },
  { traditional: '啊', simplified: '啊', pinyin: 'a4', definitions: ['grunt of agreement', 'uhm', 'Ah, OK', "Oh, it's you!"] },
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
   * Nothing here was wrong. `rankEntries` scores the displayed reading above
   * every other signal, which is correct — it is just that the reading it was
   * shown was `a1`, chosen at build time with no sentence in front of it. Given
   * `a5` the same function picks the sentence-final particle unaided, which is
   * why closing this defect took no change to entries.ts at all.
   */
  test('picks the sentence-final particle once the reading is a5', () => {
    expect(rankEntries(A, '啊', 'a5')[0].definitions[0]).toContain('modal particle')
  })

  test('still picks the interjection when the reading really is a1', () => {
    expect(rankEntries(A, '啊', 'a1')[0].definitions[0]).toContain('surprise')
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
    const woqu = entry('wo3 qu4', "(slang) what the ...!; oh my god!")
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
