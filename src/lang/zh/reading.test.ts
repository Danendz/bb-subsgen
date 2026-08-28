import { describe, expect, test } from 'vitest'
import { applyReadingRules, readingParts } from './reading'
import type { Token } from '../pack'
import { readingText } from '../reading'
import { isFunctionWord } from './grammar/function-words'

function tokens(...pairs: [string, string | null][]): Token[] {
  return pairs.map(([text, pinyin]) => ({
    text,
    reading: pinyin === null ? null : readingParts(text, pinyin),
    kind: pinyin === null ? 'other' : isFunctionWord(text) ? 'function' : 'content',
  }))
}

// Display form, because that is all a token carries now: the tone digit is
// resolved as the parts are built.
const readings = (result: Token[]) => result.map((t) => (t.reading ? readingText(t.reading) : null))

describe('readingParts', () => {
  // The property #16 needs and a string could never carry: which syllable is
  // drawn over which character.
  test('pairs each syllable with the character it is said over', () => {
    expect(readingParts('喜欢', 'xi3 huan5')).toEqual([
      { base: '喜', text: 'xǐ', tone: 3 },
      { base: '欢', text: 'huan', tone: 5 },
    ])
  })

  test('carries the tone off the syllable, so no renderer has to parse one', () => {
    expect(readingParts('好', 'hao3')[0]).toEqual({ base: '好', text: 'hǎo', tone: 3 })
  })

  // 不入虎穴，焉得虎子 is nine code points and eight syllables — the comma is
  // written and not said, and nothing says which syllable it displaced.
  test('leaves the alignment blank rather than inventing one when the counts disagree', () => {
    const parts = readingParts('不入虎穴，焉得虎子', 'bu4 ru4 hu3 xue2 yan1 de2 hu3 zi3')
    expect(parts).toHaveLength(8)
    expect(parts.every((part) => part.base === '')).toBe(true)
    expect(readingText(parts)).toBe('bù rù hǔ xué yān dé hǔ zǐ')
  })

  // A headword the word list carries with no reading at all is a normal state,
  // not a one-part reading of the empty string.
  test('reads nothing as no parts, not as one empty part', () => {
    expect(readingParts('々', '')).toEqual([])
    expect(readingParts('々', '   ')).toEqual([])
  })
})

describe('applyReadingRules', () => {
  // 得 defaults to the structural particle, which is right after a verb — but
  // 我得走了 is "I have to go", a different word with a different sound. What
  // separates them is what comes before: a particle attaches to a verb, and
  // there is no verb behind 得 here, only the subject.
  test('reads 得 as dei3 when nothing precedes it for a complement to attach to', () => {
    const result = applyReadingRules(tokens(['我', 'wo3'], ['得', 'de5'], ['走', 'zou3']))
    expect(readings(result)).toEqual(['wǒ', 'děi', 'zǒu'])
  })

  test('leaves 得 as the particle when a verb precedes it', () => {
    const result = applyReadingRules(tokens(['跑', 'pao3'], ['得', 'de5'], ['快', 'kuai4']))
    expect(readings(result)).toEqual(['pǎo', 'de', 'kuài'])
  })

  test('reads 得 as the particle at the head of a complement in the target line', () => {
    const result = applyReadingRules(
      tokens(['时间', 'shi2 jian1'], ['过', 'guo4'], ['得', 'de5'], ['很', 'hen3']),
    )
    expect(readings(result)).toEqual(['shí jiān', 'guò', 'de', 'hěn'])
  })

  // 了 in V不了 / V得了 is liao3 — "cannot finish", not the aspect marker.
  test('reads 了 as liao3 in the potential complement', () => {
    expect(
      readings(applyReadingRules(tokens(['吃', 'chi1'], ['不', 'bu4'], ['了', 'le5']))),
    ).toEqual(['chī', 'bù', 'liǎo'])
    expect(
      readings(applyReadingRules(tokens(['受', 'shou4'], ['得', 'de5'], ['了', 'le5']))),
    ).toEqual(['shòu', 'de', 'liǎo'])
  })

  test('leaves 了 as the aspect marker everywhere else', () => {
    const result = applyReadingRules(tokens(['吃', 'chi1'], ['饭', 'fan4'], ['了', 'le5']))
    expect(readings(result)).toEqual(['chī', 'fàn', 'le'])
  })

  // 得 preceding 了 is itself the potential marker, not a complement head —
  // both rules touch the same span and must not disagree.
  test('keeps 得了 consistent when both rules could fire', () => {
    const result = applyReadingRules(tokens(['受', 'shou4'], ['得', 'de5'], ['了', 'le5']))
    expect(readings(result)).toEqual(['shòu', 'de', 'liǎo'])
  })

  test('leaves multi-character tokens and punctuation untouched', () => {
    const result = applyReadingRules(tokens(['觉得', 'jue2 de5'], ['。', null]))
    expect(readings(result)).toEqual(['jué de', null])
  })

  test('returns a new array rather than mutating the input', () => {
    const input = tokens(['我', 'wo3'], ['得', 'de5'], ['走', 'zou3'])
    applyReadingRules(input)
    expect(readingText(input[1].reading ?? [])).toBe('de')
  })
})
