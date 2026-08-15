import { describe, expect, test } from 'vitest'
import { inlineSpans, renderable } from './markdown'

describe('inlineSpans', () => {
  test('leaves plain text alone', () => {
    expect(inlineSpans('了 marks completion')).toEqual([
      { kind: 'text', text: '了 marks completion' },
    ])
  })

  test('pulls out bold', () => {
    expect(inlineSpans('the word **了** here')).toEqual([
      { kind: 'text', text: 'the word ' },
      { kind: 'bold', text: '了' },
      { kind: 'text', text: ' here' },
    ])
  })

  test('pulls out code', () => {
    expect(inlineSpans('pinyin is `le`')).toEqual([
      { kind: 'text', text: 'pinyin is ' },
      { kind: 'code', text: 'le' },
    ])
  })

  test('handles several in one line', () => {
    expect(inlineSpans('**了** and **吗** differ')).toEqual([
      { kind: 'bold', text: '了' },
      { kind: 'text', text: ' and ' },
      { kind: 'bold', text: '吗' },
      { kind: 'text', text: ' differ' },
    ])
  })

  // A lone asterisk is far more likely to be punctuation than a broken tag.
  test('leaves an unmatched marker as text', () => {
    expect(inlineSpans('2 * 3 = 6')).toEqual([{ kind: 'text', text: '2 * 3 = 6' }])
  })

  test('leaves an unclosed bold as text', () => {
    expect(inlineSpans('**unfinished')).toEqual([{ kind: 'text', text: '**unfinished' }])
  })

  test('an empty line has no spans', () => {
    expect(inlineSpans('')).toEqual([])
  })
})

describe('renderable', () => {
  test('splits on newlines', () => {
    expect(renderable('one\ntwo')).toEqual([
      [{ kind: 'text', text: 'one' }],
      [{ kind: 'text', text: 'two' }],
    ])
  })

  // The blank line between an explanation and its example is the paragraph break.
  test('keeps blank lines', () => {
    expect(renderable('a\n\nb')).toHaveLength(3)
  })
})
