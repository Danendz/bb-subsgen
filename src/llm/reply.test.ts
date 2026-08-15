import { describe, expect, test } from 'vitest'
import { stripThinkBlocks } from './reply'

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
