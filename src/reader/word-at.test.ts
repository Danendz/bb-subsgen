import { describe, expect, test } from 'vitest'
import { chinesePack } from '../lang/zh/pack'
import { wordAt } from './word-at'

/**
 * A real lexicon over three lines of CC-CEDICT rather than a fake: the point is
 * that `wordAt` asks the lexicon and reports what it says, and a three-line
 * dictionary is cheaper to read than a stub with the same behaviour.
 */
const lexicon = chinesePack.load('我\two3\n学习\txue2 xi2\n中文\tzhong1 wen2')

describe('wordAt', () => {
  test('reports the word covering the index, not the one that starts at it', () => {
    // Landing on 习 has to answer 学习 — a caret lands mid-word far more often
    // than on its first character.
    expect(wordAt(lexicon, '我学习中文', 2)?.match.text).toBe('学习')
  })

  test('answers nothing where the dictionary has no word', () => {
    expect(wordAt(lexicon, 'hello there', 3)).toBeNull()
  })

  test('carries the sentence the word was met in, for the translation line', () => {
    // Two sentences in one block: the card must not be handed both.
    const found = wordAt(lexicon, '我学习中文。中文很难。', 1)
    expect(found?.match.text).toBe('学习')
    expect(found?.sentence).toBe('我学习中文。')
  })

  test('the sentence is the pack’s answer, so a language with other terminators keeps its own', () => {
    // `wordAt` never splits text itself — it goes through `lexicon.pack`, which
    // is the whole reason it takes a lexicon rather than a raw word list.
    expect(wordAt(lexicon, '我学习中文！', 2)?.sentence).toBe('我学习中文！')
  })
})
