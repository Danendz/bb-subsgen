import { describe, expect, test } from 'vitest'
import { chinesePack } from './pack'

describe('chinesePack.containsScript', () => {
  test('finds Han anywhere in the string, not only at the front', () => {
    // The bilingual case: a line the reader must still offer to look up.
    expect(chinesePack.containsScript('hello 学习')).toBe(true)
    expect(chinesePack.containsScript('学')).toBe(true)
  })

  test('punctuation alone is not text to look up', () => {
    expect(chinesePack.containsScript('hello world')).toBe(false)
    expect(chinesePack.containsScript('')).toBe(false)
    expect(chinesePack.containsScript('。！？')).toBe(false)
  })
})

describe('chinesePack.cardHeadwords', () => {
  test('asks for the word and each of its characters in one batch', () => {
    expect(chinesePack.cardHeadwords('学习')).toEqual(['学习', '学', '习'])
  })

  test('asks only for itself when there is nothing to break down', () => {
    // The breakdown of 我 is 我 — noise, not information.
    expect(chinesePack.cardHeadwords('学')).toEqual(['学'])
  })

  test('ignores non-Han characters when deciding', () => {
    expect(chinesePack.cardHeadwords('学!')).toEqual(['学!'])
  })
})
