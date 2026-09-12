import { describe, expect, test } from 'vitest'
import { buildChoices, OPTION_COUNT } from './choices'
import { seedFor } from './wordbank'

const texts = (choices: ReturnType<typeof buildChoices>) => choices.map((c) => c.text)

describe('buildChoices', () => {
  test('the right answer is always in there somewhere', () => {
    const choices = buildChoices('to study', ['school', 'student', 'parrot', 'of'], 42)
    expect(choices.filter((c) => c.correct)).toHaveLength(1)
    expect(texts(choices)).toContain('to study')
    expect(choices).toHaveLength(OPTION_COUNT)
  })

  test('two words that mean the same thing are not both offered', () => {
    // 高兴 and 快乐 are both "happy". Offering both makes two options correct
    // and the card unanswerable — the same hazard `buildBank` drops duplicate
    // tiles for.
    const choices = buildChoices('happy', ['happy', 'tired', 'hungry'], 7)
    expect(texts(choices).filter((text) => text === 'happy')).toHaveLength(1)
    expect(choices.filter((c) => c.correct)).toHaveLength(1)
  })

  test('a repeated distractor takes one slot, not two', () => {
    const choices = buildChoices('to study', ['school', 'school', 'student'], 7)
    expect(texts(choices).sort()).toEqual(['school', 'student', 'to study'])
  })

  test('spare candidates stay spare — four options, however many were offered', () => {
    const choices = buildChoices('to study', ['a', 'b', 'c', 'd', 'e', 'f'], 3)
    expect(choices).toHaveLength(OPTION_COUNT)
  })

  test('the arrangement survives a re-render and changes between sittings', () => {
    // Options rearranging under the user's finger mid-answer reads as a bug;
    // options in the same place every sitting is a card answered from memory of
    // where the answer sat.
    const pool = ['school', 'student', 'parrot']
    const first = texts(buildChoices('to study', pool, seedFor('w:zh:学习', 3)))
    expect(texts(buildChoices('to study', pool, seedFor('w:zh:学习', 3)))).toEqual(first)
    expect(texts(buildChoices('to study', pool, seedFor('w:zh:学习', 4)))).not.toEqual(first)
  })

  test('a word the dictionary cannot gloss is not asked about at all', () => {
    // No correct option to offer. An option set with nothing right in it is
    // worse than skipping the question.
    expect(buildChoices('', ['school', 'student', 'parrot'], 1)).toEqual([])
  })

  test('offers what it has when the deck could not fill four', () => {
    const choices = buildChoices('to study', ['school'], 1)
    expect(texts(choices).sort()).toEqual(['school', 'to study'])
  })
})
