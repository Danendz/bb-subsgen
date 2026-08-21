// @vitest-environment jsdom
import { describe, expect, test } from 'vitest'
import {
  buildCard,
  buildWordElement,
  cardHeadwords,
  characterBreakdown,
  setCardTranslation,
} from './card'
import type { CedictEntry } from '../lang/dict'
import { PATTERNS } from '../lang/grammar/patterns'

const entry = (over: Partial<CedictEntry> = {}): CedictEntry => ({
  simplified: '学习',
  traditional: '學習',
  pinyin: 'xue2 xi2',
  definitions: ['to learn', 'to study'],
  ...over,
})

const xue = entry({
  simplified: '学',
  traditional: '學',
  pinyin: 'xue2',
  definitions: ['to learn', 'school'],
})
const xi = entry({
  simplified: '习',
  traditional: '習',
  pinyin: 'xi2',
  definitions: ['to practice'],
})

describe('characterBreakdown', () => {
  test('returns one row per character with its own reading and gloss', () => {
    expect(characterBreakdown('学习', { 学: [xue], 习: [xi] })).toEqual([
      { char: '学', pinyin: 'xue2', gloss: 'to learn; school' },
      { char: '习', pinyin: 'xi2', gloss: 'to practice' },
    ])
  })

  test('breaks down nothing for a single character', () => {
    // The breakdown of 我 is 我 — noise, not information.
    expect(characterBreakdown('学', { 学: [xue] })).toEqual([])
  })

  test('skips characters the dictionary has no entry for', () => {
    expect(characterBreakdown('学习', { 学: [xue], 习: [] })).toEqual([
      { char: '学', pinyin: 'xue2', gloss: 'to learn; school' },
    ])
  })

  test('ignores non-Han characters in the headword', () => {
    // Punctuation and latin never get a row, and never count toward the
    // two-character minimum either.
    expect(characterBreakdown('学!', { 学: [xue] })).toEqual([])
  })

  test('drops entries whose definitions are all classifier notation', () => {
    const clOnly = entry({ simplified: '习', pinyin: 'xi2', definitions: ['CL:個|个[ge4]'] })
    expect(characterBreakdown('学习', { 学: [xue], 习: [clOnly] })).toEqual([
      { char: '学', pinyin: 'xue2', gloss: 'to learn; school' },
    ])
  })
})

describe('cardHeadwords', () => {
  test('asks for the word and each of its characters in one batch', () => {
    expect(cardHeadwords('学习')).toEqual(['学习', '学', '习'])
  })

  test('asks only for itself when there is nothing to break down', () => {
    expect(cardHeadwords('学')).toEqual(['学'])
  })

  test('ignores non-Han characters when deciding', () => {
    expect(cardHeadwords('学!')).toEqual(['学!'])
  })
})

describe('buildCard', () => {
  const opts = { useTraditional: false }

  test('renders the headword and its reading', () => {
    const card = buildCard({ headword: '学习', entries: [entry()] }, opts)
    expect(card.querySelector('.popup-word')?.textContent).toBe('学习')
    expect(card.querySelector('.popup-pinyin')?.textContent).toBe('xuéxí')
  })

  test('omits the breakdown section when there are no rows', () => {
    const card = buildCard({ headword: '学习', entries: [entry()] }, opts)
    expect(card.querySelector('.popup-chars')).toBeNull()
  })

  test('renders a row per breakdown entry', () => {
    const card = buildCard(
      {
        headword: '学习',
        entries: [entry()],
        breakdown: characterBreakdown('学习', { 学: [xue], 习: [xi] }),
      },
      opts,
    )
    expect(card.querySelectorAll('.popup-char')).toHaveLength(2)
  })

  test('never shows a click-to-expand affordance', () => {
    // Characters are always listed now, so there is nothing left to expand.
    const card = buildCard(
      {
        headword: '学习',
        entries: [entry()],
        breakdown: characterBreakdown('学习', { 学: [xue], 习: [xi] }),
      },
      opts,
    )
    expect(card.querySelector('.popup-hint')).toBeNull()
  })

  test('keeps an empty sentence slot so a late translation can be patched in', () => {
    const card = buildCard({ headword: '学习', entries: [entry()] }, opts)
    const sentence = card.querySelector('.popup-sentence')
    expect(sentence).not.toBeNull()
    expect(sentence?.textContent).toBe('')

    setCardTranslation(card, 'Learning Chinese is fun.')
    expect(card.querySelector('.popup-sentence')?.textContent).toBe('Learning Chinese is fun.')
  })

  test('still renders pinyin and the sentence slot when no definition exists', () => {
    // A word the dictionary misses is a degraded card, never a broken one.
    const card = buildCard({ headword: '沒有', displayedPinyin: 'mei2 you3', entries: [] }, opts)
    expect(card.querySelector('.popup-empty')?.textContent).toBe('No definition found')
    expect(card.querySelector('.popup-pinyin')?.textContent).toBe('méiyǒu')
    expect(card.querySelector('.popup-sentence')).not.toBeNull()
  })
})

describe('the structure section', () => {
  const opts = { useTraditional: false }
  const complement = PATTERNS.find((p) => p.id === 'de-complement')!

  test('names the pattern, shows its shape, and explains what it does', () => {
    const card = buildCard(
      {
        headword: '得',
        entries: [entry({ simplified: '得', definitions: ['structural particle'] })],
        patterns: [complement],
      },
      opts,
    )

    const section = card.querySelector('.popup-structure')
    expect(section?.textContent).toContain(complement.name)
    expect(section?.textContent).toContain(complement.skeleton)
    expect(section?.textContent).toContain('how the action goes')
  })

  test('renders nothing at all when the word is not part of a pattern', () => {
    const card = buildCard({ headword: '学习', entries: [entry()] }, opts)
    expect(card.querySelector('.popup-structure')).toBeNull()
  })

  test('lists every pattern the word belongs to', () => {
    const final = PATTERNS.find((p) => p.id === 'sentence-final-a')!
    const card = buildCard(
      {
        headword: '啊',
        entries: [entry({ simplified: '啊', definitions: ['particle'] })],
        patterns: [complement, final],
      },
      opts,
    )

    expect(card.querySelectorAll('.popup-pattern')).toHaveLength(2)
  })
})

describe('dimming function words', () => {
  const style = { showPinyin: true, showToneColors: true }

  test('marks a structural particle so it can be told from vocabulary', () => {
    const el = buildWordElement({ text: '得', pinyin: 'de5' }, style)
    expect(el.classList.contains('function')).toBe(true)
  })

  test('leaves ordinary vocabulary unmarked', () => {
    const el = buildWordElement({ text: '时间', pinyin: 'shi2 jian1' }, style)
    expect(el.classList.contains('function')).toBe(false)
  })

  test('does not mark punctuation, which is not a word at all', () => {
    const el = buildWordElement({ text: '。', pinyin: null }, style)
    expect(el.classList.contains('function')).toBe(false)
  })
})
