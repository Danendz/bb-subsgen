import { describe, expect, test } from 'vitest'
import { segment } from './segment'

function dict(entries: Record<string, string>): Map<string, string> {
  return new Map(Object.entries(entries))
}

describe('segment', () => {
  test('merges base tokens into the longest dictionary word', () => {
    const words = dict({
      我: 'wo3',
      喜欢: 'xi3 huan5',
      学: 'xue2',
      中文: 'zhong1 wen2',
    })

    const tokens = segment('我喜欢学中文', words)

    expect(tokens).toEqual([
      { text: '我', pinyin: 'wo3' },
      { text: '喜欢', pinyin: 'xi3 huan5' },
      { text: '学', pinyin: 'xue2' },
      { text: '中文', pinyin: 'zhong1 wen2' },
    ])
  })

  test('resolves 多音字 pinyin from the matched compound, not the character', () => {
    const words = dict({
      银行: 'yin2 hang2',
      行为: 'xing2 wei2',
      银: 'yin2',
      行: 'hang2',
      为: 'wei4',
    })

    expect(segment('银行', words)).toEqual([{ text: '银行', pinyin: 'yin2 hang2' }])
    expect(segment('行为', words)).toEqual([{ text: '行为', pinyin: 'xing2 wei2' }])
  })

  test('passes non-hanzi tokens through as inert (pinyin: null)', () => {
    const words = dict({ 你好: 'ni3 hao3' })

    const tokens = segment('BV1234 你好!', words)

    expect(tokens.map((t) => t.text).join('')).toBe('BV1234 你好!')
    const hanziToken = tokens.find((t) => t.text === '你好')
    expect(hanziToken).toEqual({ text: '你好', pinyin: 'ni3 hao3' })
    for (const t of tokens) {
      if (t.text !== '你好') expect(t.pinyin).toBeNull()
    }
  })

  test('falls back to per-character lookup for hanzi outside the dictionary', () => {
    const words = dict({ 我: 'wo3' })

    const tokens = segment('我们', words)

    expect(tokens).toEqual([
      { text: '我', pinyin: 'wo3' },
      { text: '们', pinyin: null },
    ])
  })
})
