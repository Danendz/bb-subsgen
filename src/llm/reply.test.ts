import { describe, expect, test } from 'vitest'
import { extractJson, stripThinkBlocks } from './reply'

describe('stripThinkBlocks', () => {
  test('leaves an ordinary reply alone', () => {
    expect(stripThinkBlocks('了 marks a completed action.')).toBe('了 marks a completed action.')
  })

  test('removes a closed scratchpad', () => {
    expect(stripThinkBlocks('<think>the user asks about 了</think>了 marks completion.')).toBe(
      '了 marks completion.',
    )
  })

  test('removes several of them', () => {
    expect(stripThinkBlocks('<think>a</think>one<think>b</think>two')).toBe('onetwo')
  })

  test('spans newlines, which is how they actually arrive', () => {
    expect(stripThinkBlocks('<think>\nline one\nline two\n</think>\nanswer')).toBe('answer')
  })

  // A reply cut off at the token limit mid-thought leaves the tag unclosed;
  // keeping the scratchpad would be worse than showing nothing.
  test('drops everything after an unclosed opening tag', () => {
    expect(stripThinkBlocks('<think>still reasoning and then the tokens ran')).toBe('')
  })

  test('is case insensitive', () => {
    expect(stripThinkBlocks('<THINK>x</THINK>answer')).toBe('answer')
  })
})

describe('extractJson', () => {
  test('reads a bare object', () => {
    expect(extractJson('{"lines":[{"id":0}]}')).toEqual({ lines: [{ id: 0 }] })
  })

  test('reads a bare array', () => {
    expect(extractJson('[1,2]')).toEqual([1, 2])
  })

  // `response_format` is a request, not a guarantee — a server that ignores it
  // still answers, just wrapped.
  test('digs it out of a fenced block', () => {
    expect(extractJson('```json\n{"lines":[]}\n```')).toEqual({ lines: [] })
  })

  test('digs it out from behind a preamble', () => {
    expect(extractJson('Sure! Here are the translations:\n{"lines":[]}')).toEqual({ lines: [] })
  })

  // Scanning to the *last* brace, not the first close: an object wrapping an
  // array would otherwise be cut short at the array's own bracket.
  test('does not stop at an inner closing bracket', () => {
    expect(extractJson('noise {"lines":[{"id":1}],"n":2} tail')).toEqual({
      lines: [{ id: 1 }],
      n: 2,
    })
  })

  test('strips a reasoning block before looking', () => {
    expect(extractJson('<think>planning</think>{"lines":[]}')).toEqual({ lines: [] })
  })

  test('is null when there is no JSON in it at all', () => {
    expect(extractJson('I cannot translate that.')).toBeNull()
  })

  test('is null when what looks like JSON is not', () => {
    expect(extractJson('{not json at all}')).toBeNull()
  })
})
