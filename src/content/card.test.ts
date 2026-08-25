// @vitest-environment jsdom
import { describe, expect, test } from 'vitest'
import { buildCard, buildWordElement, characterBreakdown, setCardTranslation } from './card'
import type { Entry } from '../lang/pack'
import { chinesePack } from '../lang/zh/pack'
import { readingParts as parts } from '../lang/zh/reading'
import { PATTERNS } from '../lang/zh/grammar/patterns'

/**
 * Built through the pack rather than written out as an `Entry` literal, so
 * these cases still exercise the conversion the card now depends on — a
 * definition that is nothing but `CL:` notation has to arrive here with no
 * senses on it for the breakdown to skip it.
 */
const entry = (headword: string, pinyin: string, ...definitions: string[]): Entry =>
  chinesePack.entriesFrom(
    [{ simplified: headword, traditional: headword, pinyin, definitions }],
    headword,
    { traditional: false },
  )[0]

const xuexi = () => entry('学习', 'xue2 xi2', 'to learn', 'to study')
const xue = entry('学', 'xue2', 'to learn', 'school')
const xi = entry('习', 'xi2', 'to practice')

describe('characterBreakdown', () => {
  test('returns one row per character with its own reading and gloss', () => {
    expect(characterBreakdown('学习', { 学: [xue], 习: [xi] }, chinesePack)).toEqual([
      { char: '学', reading: parts('学', 'xue2'), gloss: 'to learn; school' },
      { char: '习', reading: parts('习', 'xi2'), gloss: 'to practice' },
    ])
  })

  test('breaks down nothing for a single character', () => {
    // The breakdown of 我 is 我 — noise, not information.
    expect(characterBreakdown('学', { 学: [xue] }, chinesePack)).toEqual([])
  })

  test('skips characters the dictionary has no entry for', () => {
    expect(characterBreakdown('学习', { 学: [xue], 习: [] }, chinesePack)).toEqual([
      { char: '学', reading: parts('学', 'xue2'), gloss: 'to learn; school' },
    ])
  })

  test('ignores non-Han characters in the headword', () => {
    // Punctuation and latin never get a row, and never count toward the
    // two-character minimum either.
    expect(characterBreakdown('学!', { 学: [xue] }, chinesePack)).toEqual([])
  })

  test('drops entries whose definitions are all classifier notation', () => {
    const clOnly = entry('习', 'xi2', 'CL:個|个[ge4]')
    expect(characterBreakdown('学习', { 学: [xue], 习: [clOnly] }, chinesePack)).toEqual([
      { char: '学', reading: parts('学', 'xue2'), gloss: 'to learn; school' },
    ])
  })
})

describe('buildCard', () => {
  const opts = { pack: chinesePack }

  test('renders the headword and its reading', () => {
    const card = buildCard({ headword: '学习', entries: [xuexi()] }, opts)
    expect(card.querySelector('.popup-word')?.textContent).toBe('学习')
    expect(card.querySelector('.popup-pinyin')?.textContent).toBe('xuéxí')
  })

  test('omits the breakdown section when there are no rows', () => {
    const card = buildCard({ headword: '学习', entries: [xuexi()] }, opts)
    expect(card.querySelector('.popup-chars')).toBeNull()
  })

  test('renders a row per breakdown entry', () => {
    const card = buildCard(
      {
        headword: '学习',
        entries: [xuexi()],
        breakdown: characterBreakdown('学习', { 学: [xue], 习: [xi] }, chinesePack),
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
        entries: [xuexi()],
        breakdown: characterBreakdown('学习', { 学: [xue], 习: [xi] }, chinesePack),
      },
      opts,
    )
    expect(card.querySelector('.popup-hint')).toBeNull()
  })

  test('keeps an empty sentence slot so a late translation can be patched in', () => {
    const card = buildCard({ headword: '学习', entries: [xuexi()] }, opts)
    const sentence = card.querySelector('.popup-sentence')
    expect(sentence).not.toBeNull()
    expect(sentence?.textContent).toBe('')

    setCardTranslation(card, 'Learning Chinese is fun.')
    expect(card.querySelector('.popup-sentence')?.textContent).toBe('Learning Chinese is fun.')
  })

  test('still renders pinyin and the sentence slot when no definition exists', () => {
    // A word the dictionary misses is a degraded card, never a broken one.
    const card = buildCard({ headword: '沒有', displayedReading: 'méi yǒu', entries: [] }, opts)
    expect(card.querySelector('.popup-empty')?.textContent).toBe('No definition found')
    expect(card.querySelector('.popup-pinyin')?.textContent).toBe('méiyǒu')
    expect(card.querySelector('.popup-sentence')).not.toBeNull()
  })
})

describe('the structure section', () => {
  const opts = { pack: chinesePack }
  const complement = PATTERNS.find((p) => p.id === 'de-complement')!

  test('names the pattern, shows its shape, and explains what it does', () => {
    const card = buildCard(
      {
        headword: '得',
        entries: [entry('得', 'de5', 'structural particle')],
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
    const card = buildCard({ headword: '学习', entries: [xuexi()] }, opts)
    expect(card.querySelector('.popup-structure')).toBeNull()
  })

  test('lists every pattern the word belongs to', () => {
    const final = PATTERNS.find((p) => p.id === 'sentence-final-a')!
    const card = buildCard(
      {
        headword: '啊',
        entries: [entry('啊', 'a5', 'particle')],
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
    const el = buildWordElement(
      { text: '得', reading: parts('得', 'de5'), kind: 'function' },
      style,
    )
    expect(el.classList.contains('function')).toBe(true)
  })

  test('leaves ordinary vocabulary unmarked', () => {
    const el = buildWordElement(
      { text: '时间', reading: parts('时间', 'shi2 jian1'), kind: 'content' },
      style,
    )
    expect(el.classList.contains('function')).toBe(false)
  })

  test('does not mark punctuation, which is not a word at all', () => {
    const el = buildWordElement({ text: '。', reading: null, kind: 'other' }, style)
    expect(el.classList.contains('function')).toBe(false)
  })
})

describe('positioning a reading over its characters', () => {
  const style = { showPinyin: true, showToneColors: true }

  test('splits a word its reading aligns to into one column per character', () => {
    const el = buildWordElement(
      { text: '学习', reading: parts('学习', 'xue2 xi2'), kind: 'content' },
      style,
    )
    expect([...el.querySelectorAll('.hanzi')].map((n) => n.textContent)).toEqual(['学', '习'])
    expect([...el.querySelectorAll('.pinyin')].map((n) => n.textContent)).toEqual(['xué', 'xí'])
  })

  // 不入虎穴，焉得虎子 is nine code points and eight syllables — the comma is
  // written and not said. Unalignable falls back to the flat run drawn before #22.
  test('draws a word it cannot align as one run, keeping every character', () => {
    const el = buildWordElement(
      {
        text: '不入虎穴，焉得虎子',
        reading: parts('不入虎穴，焉得虎子', 'bu4 ru4 hu3 xue2 yan1 de2 hu3 zi3'),
        kind: 'content',
      },
      style,
    )
    expect([...el.querySelectorAll('.hanzi')].map((n) => n.textContent)).toEqual([
      '不入虎穴，焉得虎子',
    ])
    expect(el.querySelectorAll('.pinyin')).toHaveLength(1)
  })

  // Nothing renders row 1 here, so the characters must not be auto-placed into it.
  test('keeps characters on the lower row when no reading is drawn above them', () => {
    const el = buildWordElement(
      { text: '学习', reading: parts('学习', 'xue2 xi2'), kind: 'content' },
      { showPinyin: false, showToneColors: false },
    )
    expect([...el.querySelectorAll('.hanzi')].map((n) => (n as HTMLElement).style.gridRow)).toEqual(
      ['2', '2'],
    )
  })
})
