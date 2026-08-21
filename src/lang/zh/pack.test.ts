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
