import { describe, expect, test } from 'vitest'
import { segment } from './segment'
import type { Lexicon } from './lexicon'

function dict(entries: Record<string, string>, phrases: string[] = []): Lexicon {
  return { words: new Map(Object.entries(entries)), phrases: new Set(phrases) }
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

  // The line that started all this. Greedy longest-match took 那时 (a real
  // CC-CEDICT word) and stranded 间, so the subtitle read "nà shí | jiān" and
  // 时间 — the actual subject of the sentence — never appeared.
  test('prefers a parse that leaves no content character stranded', () => {
    const words = dict({
      那: 'na4',
      那时: 'na4 shi2',
      时间: 'shi2 jian1',
      时: 'shi2',
      间: 'jian1',
    })

    expect(segment('那时间', words)).toEqual([
      { text: '那', pinyin: 'na4' },
      { text: '时间', pinyin: 'shi2 jian1' },
    ])
  })

  // 过得 is in CC-CEDICT as "How are you getting by?" and was consumed whole,
  // which printed `guo4 de2` over what is really a verb plus the structural
  // particle 得.
  test('does not let a phrasebook entry claim a span', () => {
    const words = dict(
      {
        过: 'guo4',
        过得: 'guo4 de2',
        得: 'de2',
        很快: 'hen3 kuai4',
      },
      ['过得'],
    )

    // 得 comes back as `de5`, not the `de2` the fixture stores: a verb precedes
    // it, so the reading rules correct it to the structural particle on the way
    // out. That is the whole point of splitting the span.
    expect(segment('过得很快', words)).toEqual([
      { text: '过', pinyin: 'guo4' },
      { text: '得', pinyin: 'de5' },
      { text: '很快', pinyin: 'hen3 kuai4' },
    ])
  })

  // 得很 is a real CC-CEDICT headword — "(after an adjective) very" — and 很快
  // is not a headword at all, so nothing stopped 过得很快 being cut as
  // 过 / 得很 / 快. But 得 read `de5` is the structural particle, and a particle
  // attaches to what came before it, never to what follows.
  test('does not let a neutral-tone particle start a word', () => {
    const words = dict({
      过: 'guo4',
      得: 'de2',
      得很: 'de5 hen3',
      很: 'hen3',
      快: 'kuai4',
    })

    expect(segment('过得很快', words).map((t) => t.text)).toEqual(['过', '得', '很', '快'])
  })

  // The same rule must not touch words where the character is not a particle:
  // 得到 is `de2 dao4`, 地方 is `di4 fang1`, 了解 is `liao3 jie3`. CC-CEDICT's
  // own reading is what tells them apart.
  test('leaves words that merely begin with the same character alone', () => {
    const words = dict({
      得到: 'de2 dao4',
      地方: 'di4 fang1',
      了解: 'liao3 jie3',
      得: 'de2',
      地: 'di4',
      了: 'le5',
      到: 'dao4',
      方: 'fang1',
      解: 'jie3',
    })

    expect(segment('得到', words).map((t) => t.text)).toEqual(['得到'])
    expect(segment('地方', words).map((t) => t.text)).toEqual(['地方'])
    expect(segment('了解', words).map((t) => t.text)).toEqual(['了解'])
  })

  // Readings are corrected as part of segmenting rather than by a pass callers
  // have to remember: the reading is what `rankEntries` weights above every
  // other signal, so a token handed out with the wrong one takes the gloss down
  // with it.
  test('applies context reading rules to the tokens it returns', () => {
    const words = dict({ 我: 'wo3', 得: 'de5', 走: 'zou3' })

    expect(segment('我得走', words)).toEqual([
      { text: '我', pinyin: 'wo3' },
      { text: '得', pinyin: 'dei3' },
      { text: '走', pinyin: 'zou3' },
    ])
  })

  test('segments the whole subtitle line correctly', () => {
    const words = dict(
      {
        那: 'na4',
        那时: 'na4 shi2',
        时间: 'shi2 jian1',
        时: 'shi2',
        间: 'jian1',
        过: 'guo4',
        过得: 'guo4 de2',
        得: 'de2',
        很: 'hen3',
        很快: 'hen3 kuai4',
        快: 'kuai4',
        啊: 'a1',
      },
      ['过得'],
    )

    expect(segment('那时间过得很快啊', words).map((t) => t.text)).toEqual([
      '那',
      '时间',
      '过',
      '得',
      '很快',
      '啊',
    ])
  })
})
