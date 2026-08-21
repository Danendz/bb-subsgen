import { describe, expect, test } from 'vitest'
import { findPatterns, patternsForWord } from './match'
import { PATTERNS } from './patterns'
import type { Token } from '../segment'

/**
 * Tokens as `segment` would hand them over.
 *
 * Written as text plus reading because several rules turn on the reading — 得
 * as `de5` is the complement head, as `dei3` it is "must" — and a matcher that
 * only saw characters could not tell those apart.
 */
function toks(spec: string): Token[] {
  return spec.split(' ').map((piece) => {
    const [text, pinyin] = piece.split('/')
    return { text, pinyin: pinyin ?? null }
  })
}

const found = (spec: string) => findPatterns(toks(spec)).map((m) => m.pattern.id)

describe('findPatterns', () => {
  test('finds the degree complement in the line from the screenshot', () => {
    // 那 时间 过 得 很 快 啊
    const matches = findPatterns(
      toks('那/na4 时间/shi2jian1 过/guo4 得/de5 很/hen3 快/kuai4 啊/a5'),
    )

    expect(matches.map((m) => m.pattern.id)).toContain('de-complement')
    expect(matches.map((m) => m.pattern.id)).toContain('sentence-final-a')
  })

  test('reports the span a pattern covers, not just that it fired', () => {
    const tokens = toks('过/guo4 得/de5 很/hen3 快/kuai4')
    const [match] = findPatterns(tokens).filter((m) => m.pattern.id === 'de-complement')

    // 过 得 很 快 — the verb through the end of the complement.
    expect(tokens.slice(match.from, match.to + 1).map((t) => t.text)).toEqual([
      '过',
      '得',
      '很',
      '快',
    ])
  })

  test('does not mistake 得 meaning "must" for a complement', () => {
    expect(found('我/wo3 得/dei3 走/zou3 了/le5')).not.toContain('de-complement')
  })

  test('finds the 把 construction', () => {
    expect(found('我/wo3 把/ba3 书/shu1 放/fang4 在/zai4 桌子/zhuo1zi5 上/shang4')).toContain(
      'ba-construction',
    )
  })

  test('finds the passive with 被', () => {
    expect(found('他/ta1 被/bei4 老师/lao3shi1 批评/pi1ping2 了/le5')).toContain('bei-passive')
  })

  test('finds comparison with 比', () => {
    expect(found('他/ta1 跑/pao3 得/de5 比/bi3 我/wo3 快/kuai4')).toContain('bi-comparison')
  })

  test('separates the two jobs of 了', () => {
    // Sitting at the end of the sentence: a change of state.
    expect(found('我/wo3 知道/zhi1dao4 了/le5')).toContain('le-change-of-state')
    // Straight after the verb with an object following: completed action.
    expect(found('我/wo3 吃/chi1 了/le5 饭/fan4')).toContain('le-completed-action')
  })

  test('finds the 是…的 frame', () => {
    expect(found('我/wo3 是/shi4 昨天/zuo2tian1 来/lai2 的/de5')).toContain('shi-de')
  })

  test('finds a yes/no question', () => {
    expect(found('你/ni3 是/shi4 学生/xue2sheng1 吗/ma5')).toContain('ma-question')
  })

  // 过 reads `guo4` in real segmented text — that is the declared default, and
  // it is the right one for 时间过得很快 where 过 is the main verb. So the
  // experience marker cannot be recognised by its reading, and has to be
  // recognised by its position instead.
  test('finds the experience marker on the reading real text actually carries', () => {
    expect(found('我/wo3 去/qu4 过/guo4 中国/zhong1guo2')).toContain('guo-experience')
  })

  test('does not read 过 as the experience marker when it is the verb', () => {
    expect(found('时间/shi2jian1 过/guo4 得/de5 很/hen3 快/kuai4')).not.toContain('guo-experience')
  })

  test('returns nothing for a line with no structure to point at', () => {
    expect(found('学生/xue2sheng1')).toEqual([])
  })

  test('orders matches by where they start', () => {
    const matches = findPatterns(
      toks('我/wo3 把/ba3 书/shu1 看/kan4 得/de5 很/hen3 慢/man4 吗/ma5'),
    )
    const starts = matches.map((m) => m.from)
    expect(starts).toEqual([...starts].sort((a, b) => a - b))
  })
})

describe('the pattern table', () => {
  test('every pattern has a unique id', () => {
    const ids = PATTERNS.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  // A grammar flashcard's identity is derived from the pattern id, so an id that
  // moves takes a card's whole review history with it.
  test('ids are stable slugs, safe to build a card id from', () => {
    for (const pattern of PATTERNS) {
      expect(pattern.id, `${pattern.name} has an unstable id`).toMatch(/^[a-z][a-z0-9-]*$/)
    }
  })

  test('every pattern says what it is, how it looks, and what it does', () => {
    for (const pattern of PATTERNS) {
      expect(pattern.name, pattern.id).toBeTruthy()
      expect(pattern.skeleton, pattern.id).toBeTruthy()
      expect(pattern.explanation.length, `${pattern.id} explanation is too thin`).toBeGreaterThan(
        20,
      )
    }
  })

  // Each pattern carries the line it was written against, so the table cannot
  // drift away from the matcher without a test noticing.
  test('every pattern matches its own example', () => {
    for (const pattern of PATTERNS) {
      const ids = findPatterns(toks(pattern.example)).map((m) => m.pattern.id)
      expect(ids, `${pattern.id} does not match its own example`).toContain(pattern.id)
    }
  })
})

describe('patternsForWord', () => {
  const line = toks('那/na4 时间/shi2jian1 过/guo4 得/de5 很/hen3 快/kuai4 啊/a5')

  test('gives a hovered particle the pattern it belongs to', () => {
    expect(patternsForWord(line, '得').map((p) => p.id)).toEqual(['de-complement'])
  })

  test('gives the sentence-final particle its own pattern, not the complement', () => {
    expect(patternsForWord(line, '啊').map((p) => p.id)).toEqual(['sentence-final-a'])
  })

  // 过 is inside the complement's span without being its anchor, and hovering it
  // is exactly when someone is confused about why 过得 is not a word.
  test('gives a word inside a span the pattern too, not just the anchor', () => {
    expect(patternsForWord(line, '过').map((p) => p.id)).toEqual(['de-complement'])
  })

  test('gives nothing for a word outside every span', () => {
    expect(patternsForWord(line, '那')).toEqual([])
  })

  test('gives nothing for a word that is not in the line', () => {
    expect(patternsForWord(line, '学习')).toEqual([])
  })
})
