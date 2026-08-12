// @vitest-environment jsdom
import { describe, expect, test } from 'vitest'
import { buildCard, cardHeadwords, characterBreakdown, setCardTranslation } from './card'
import type { CedictEntry } from '../lang/dict'

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
    expect(card.querySelector('.popup-sentence')?.textContent).toBe(
      'Learning Chinese is fun.',
    )
  })

  test('still renders pinyin and the sentence slot when no definition exists', () => {
    // A word the dictionary misses is a degraded card, never a broken one.
    const card = buildCard({ headword: '沒有', displayedPinyin: 'mei2 you3', entries: [] }, opts)
    expect(card.querySelector('.popup-empty')?.textContent).toBe('No definition found')
    expect(card.querySelector('.popup-pinyin')?.textContent).toBe('méiyǒu')
    expect(card.querySelector('.popup-sentence')).not.toBeNull()
  })
})
