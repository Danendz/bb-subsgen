import { describe, expect, test } from 'vitest'
import { applyReadingRules } from './reading'
import type { Token } from '../pack'

function tokens(...pairs: [string, string | null][]): Token[] {
  return pairs.map(([text, pinyin]) => ({ text, pinyin }))
}

const readings = (result: Token[]) => result.map((t) => t.pinyin)

describe('applyReadingRules', () => {
  // 得 defaults to the structural particle, which is right after a verb — but
  // 我得走了 is "I have to go", a different word with a different sound. What
  // separates them is what comes before: a particle attaches to a verb, and
  // there is no verb behind 得 here, only the subject.
  test('reads 得 as dei3 when nothing precedes it for a complement to attach to', () => {
    const result = applyReadingRules(tokens(['我', 'wo3'], ['得', 'de5'], ['走', 'zou3']))
    expect(readings(result)).toEqual(['wo3', 'dei3', 'zou3'])
  })

  test('leaves 得 as the particle when a verb precedes it', () => {
    const result = applyReadingRules(tokens(['跑', 'pao3'], ['得', 'de5'], ['快', 'kuai4']))
    expect(readings(result)).toEqual(['pao3', 'de5', 'kuai4'])
  })

  test('reads 得 as the particle at the head of a complement in the target line', () => {
    const result = applyReadingRules(
      tokens(['时间', 'shi2 jian1'], ['过', 'guo4'], ['得', 'de5'], ['很', 'hen3']),
    )
    expect(readings(result)).toEqual(['shi2 jian1', 'guo4', 'de5', 'hen3'])
  })

  // 了 in V不了 / V得了 is liao3 — "cannot finish", not the aspect marker.
  test('reads 了 as liao3 in the potential complement', () => {
    expect(
      readings(applyReadingRules(tokens(['吃', 'chi1'], ['不', 'bu4'], ['了', 'le5']))),
    ).toEqual(['chi1', 'bu4', 'liao3'])
    expect(
      readings(applyReadingRules(tokens(['受', 'shou4'], ['得', 'de5'], ['了', 'le5']))),
    ).toEqual(['shou4', 'de5', 'liao3'])
  })

  test('leaves 了 as the aspect marker everywhere else', () => {
    const result = applyReadingRules(tokens(['吃', 'chi1'], ['饭', 'fan4'], ['了', 'le5']))
    expect(readings(result)).toEqual(['chi1', 'fan4', 'le5'])
  })

  // 得 preceding 了 is itself the potential marker, not a complement head —
  // both rules touch the same span and must not disagree.
  test('keeps 得了 consistent when both rules could fire', () => {
    const result = applyReadingRules(tokens(['受', 'shou4'], ['得', 'de5'], ['了', 'le5']))
    expect(readings(result)).toEqual(['shou4', 'de5', 'liao3'])
  })

  test('leaves multi-character tokens and punctuation untouched', () => {
    const result = applyReadingRules(tokens(['觉得', 'jue2 de5'], ['。', null]))
    expect(readings(result)).toEqual(['jue2 de5', null])
  })

  test('returns a new array rather than mutating the input', () => {
    const input = tokens(['我', 'wo3'], ['得', 'de5'], ['走', 'zou3'])
    applyReadingRules(input)
    expect(input[1].pinyin).toBe('de5')
  })
})
