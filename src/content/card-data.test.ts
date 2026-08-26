import { describe, expect, test } from 'vitest'
import { cardData, characterBreakdown, displayedReadingFor, headwordOf } from './card-data'
import type { Entry, LanguagePack, Match, Sense, Token } from '../lang/pack'
import { chinesePack } from '../lang/zh/pack'
import { readingParts as parts } from '../lang/zh/reading'

/**
 * A language that cuts on spaces and ranks nothing.
 *
 * The only fake pack in the suite, and it is here because this is the one place
 * the claim is worth making: the card's model must depend on no language's
 * linguistics. Everything else — the segmenting, the deinflection, the ranking
 * — is tested against the real packs, where a fake would only assert that the
 * fake behaves as written.
 */
const fakePack = (): LanguagePack => ({
  code: 'xx',
  name: 'Test',
  displaysTones: false,
  inScript: () => true,
  containsScript: () => true,
  load: () => {
    throw new Error('not used')
  },
  sentenceTextAt: (text) => text,
  // One unit per word, so nothing is ever broken down — the case a language
  // whose script is not per-character has on every single card.
  cardHeadwords: (headword) => [headword],
  findPatterns: () => [],
  patternsForWord: () => [],
  patternById: () => undefined,
  patterns: [],
  entriesFrom: () => [],
  rank: (entries) => entries,
})

const sense = (gloss: string): Sense => ({ gloss, tags: [] })
const entry = (headword: string, gloss: string): Entry => ({
  headword,
  variants: [],
  reading: [],
  senses: [sense(gloss)],
  tags: [],
})

const match = (text: string, over: Partial<Match> = {}): Match => ({
  text,
  reading: [],
  start: 0,
  end: text.length,
  ...over,
})

describe('headwordOf', () => {
  test('a surface that is already its own headword answers itself', () => {
    expect(headwordOf(match('学习'))).toBe('学习')
  })

  test('a conjugated surface answers the form the deck and the dictionary use', () => {
    // 食べました is looked up, discovered and marked known as 食べる, or the deck
    // fills with one card per conjugation and nothing ever resolves.
    expect(headwordOf(match('食べました', { dictionary: '食べる' }))).toBe('食べる')
  })
})

describe('displayedReadingFor', () => {
  test('passes the reading on screen through when the surface is the headword', () => {
    expect(displayedReadingFor(match('学习', { reading: parts('学习', 'xue2 xi2') }))).toBe(
      'xué xí',
    )
  })

  test('withholds it on a deinflected word, where it belongs to the surface', () => {
    // The screen says たべました and `pack.rank` documents its argument as the
    // *headword's* reading — handing this over ranks 食べる by a reading no
    // entry for 食べる carries.
    const inflected = match('食べました', {
      dictionary: '食べる',
      reading: [{ base: '食', text: 'た', tone: null }],
    })
    expect(displayedReadingFor(inflected)).toBe('')
  })

  test('an override wins, including over a deinflected word', () => {
    // The selection card's words carry their reading on the element and have no
    // match of their own to have resolved.
    expect(displayedReadingFor(match('食べました', { dictionary: '食べる' }), 'たべる')).toBe(
      'たべる',
    )
  })

  test('an override of the empty string is still an answer, not a missing one', () => {
    // `dataset.reading ?? ''` is what the selection card passes, and treating
    // that as "unset" would fall back to the surface's reading instead.
    expect(displayedReadingFor(match('学习', { reading: parts('学习', 'xue2 xi2') }), '')).toBe('')
  })
})

describe('cardData', () => {
  const base = {
    found: {} as Record<string, Entry[]>,
    lexicon: null,
    pack: fakePack(),
    known: new Set<string>(),
    sentence: '',
  }

  test('is about the headword and shows the entries found for it', () => {
    const data = cardData({
      ...base,
      match: match('食べました', { dictionary: '食べる' }),
      found: { 食べる: [entry('食べる', 'to eat')], 食べました: [entry('食べました', 'wrong')] },
    })
    expect(data.headword).toBe('食べる')
    expect(data.entries).toEqual([entry('食べる', 'to eat')])
  })

  test('renders a degraded card rather than nothing when the dictionary missed the word', () => {
    expect(cardData({ ...base, match: match('学习') }).entries).toEqual([])
  })

  test('withholds the surface reading of a deinflected word', () => {
    const data = cardData({
      ...base,
      match: match('食べました', {
        dictionary: '食べる',
        reading: [{ base: '食', text: 'た', tone: null }],
      }),
    })
    expect(data.displayedReading).toBe('')
  })

  test('marks the card known by its headword, not by what is on the page', () => {
    // The deck matured 食べる; the page says 食べました. Keying the toggle on the
    // surface would show every conjugation as unknown forever.
    const data = cardData({
      ...base,
      match: match('食べました', { dictionary: '食べる' }),
      known: new Set(['食べる']),
    })
    expect(data.known).toBe(true)
  })

  test('shows no patterns before the word list has loaded', () => {
    // A card that opens on the first frame must not wait on 4.5MB to have a
    // section it usually has nothing for anyway.
    expect(cardData({ ...base, match: match('学习') }).patterns).toEqual([])
  })

  test('looks the patterns up by the surface, which is what the segmented line holds', () => {
    const seen: string[] = []
    const pack = fakePack()
    const data = cardData({
      ...base,
      pack: {
        ...pack,
        patternsForWord: (_tokens: Token[], word: string) => {
          seen.push(word)
          return []
        },
      },
      lexicon: { pack, segment: () => [], matchAt: () => null, has: () => false, search: () => [] },
      match: match('食べました', { dictionary: '食べる' }),
      sentence: '寿司を食べました',
    })
    expect(seen).toEqual(['食べました'])
    expect(data.patterns).toEqual([])
  })
})

/**
 * Moved here from the jsdom `card.test.ts` when the model left the renderer.
 * The cases are unchanged: this is pure data, and it never needed a document.
 */
describe('characterBreakdown', () => {
  const cedict = (headword: string, pinyin: string, ...definitions: string[]): Entry =>
    chinesePack.entriesFrom(
      [{ simplified: headword, traditional: headword, pinyin, definitions }],
      headword,
      { traditional: false },
    )[0]

  const xue = cedict('学', 'xue2', 'to learn', 'school')
  const xi = cedict('习', 'xi2', 'to practice')

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
    const clOnly = cedict('习', 'xi2', 'CL:個|个[ge4]')
    expect(characterBreakdown('学习', { 学: [xue], 习: [clOnly] }, chinesePack)).toEqual([
      { char: '学', reading: parts('学', 'xue2'), gloss: 'to learn; school' },
    ])
  })

  test('a language with one unit per word breaks nothing down at all', () => {
    // `cardHeadwords` is the pack's answer, not a character loop here.
    expect(
      characterBreakdown('食べる', { 食べる: [entry('食べる', 'to eat')] }, fakePack()),
    ).toEqual([])
  })
})
