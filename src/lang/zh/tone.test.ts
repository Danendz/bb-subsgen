import { describe, expect, test } from 'vitest'
import { parseTone, toDiacritic, toDiacriticPhrase, toneColor } from './tone'

describe('parseTone', () => {
  test('reads the trailing tone digit from a CC-CEDICT syllable', () => {
    expect(parseTone('xi3')).toBe(3)
    expect(parseTone('huan5')).toBe(5)
    expect(parseTone('de5')).toBe(5)
  })

  test('defaults to neutral tone when no digit is present', () => {
    expect(parseTone('haha')).toBe(5)
  })
})

describe('toneColor', () => {
  test('maps each tone to its softened palette color', () => {
    expect(toneColor(1)).toBe('#ff8a8a')
    expect(toneColor(2)).toBe('#ffc46b')
    expect(toneColor(3)).toBe('#7ee0a8')
    expect(toneColor(4)).toBe('#8ab6ff')
    expect(toneColor(5)).toBe('#c3c8d0')
  })

  test('falls back to the neutral color for an unknown tone', () => {
    expect(toneColor(9)).toBe('#c3c8d0')
  })
})

describe('toDiacritic', () => {
  test('marks a/e before other vowels', () => {
    expect(toDiacritic('hao3')).toBe('hǎo')
    expect(toDiacritic('xue2')).toBe('xué')
  })

  test('marks the rightmost vowel for u/i/o clusters', () => {
    expect(toDiacritic('guo2')).toBe('guó') // uo -> o
    expect(toDiacritic('jiu3')).toBe('jiǔ') // iu -> u
  })

  test('marks ü correctly, including after a consonant', () => {
    expect(toDiacritic('lü4')).toBe('lǜ')
  })

  test('leaves neutral tone syllables undecorated', () => {
    expect(toDiacritic('huan5')).toBe('huan')
  })

  test('preserves capitalization for proper-noun syllables', () => {
    expect(toDiacritic('Bei3')).toBe('Běi')
  })

  test('falls back to stripping the digit when no vowel is found', () => {
    expect(toDiacritic('r5')).toBe('r')
  })

  test('converts a full multi-syllable word, space-joined', () => {
    expect('xi3 huan5'.split(' ').map(toDiacritic).join('')).toBe('xǐhuan')
  })
})

describe('toDiacriticPhrase', () => {
  test('converts every syllable in a run, space-separated by default', () => {
    expect(toDiacriticPhrase('xi3 huan5')).toBe('xǐ huan')
    expect(toDiacriticPhrase('yin2 hang2')).toBe('yín háng')
  })

  test('accepts a custom separator', () => {
    expect(toDiacriticPhrase('xi3 huan5', '')).toBe('xǐhuan')
  })

  test('returns an empty string for empty input', () => {
    expect(toDiacriticPhrase('')).toBe('')
  })
})
