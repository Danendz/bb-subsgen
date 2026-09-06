import { describe, expect, test } from 'vitest'
import { translateIn } from '../i18n/t'
import { gapExplanation, gapRow, gapSummary } from './gaps'
import { japanesePack } from './ja/pack'
import { chinesePack } from './zh/pack'

const t = translateIn('en')

describe('gapSummary', () => {
  test('says nothing about a language with nothing outstanding', () => {
    // The wizard maps over every source, so the empty case is the common one —
    // and an empty string is what tells the card not to draw a badge at all.
    expect(gapSummary(chinesePack, t, 'en')).toBe('')
  })

  test('names every gap in one sentence, joined the way the locale joins lists', () => {
    expect(gapSummary(japanesePack, t, 'en')).toBe(
      'Still being built for Japanese: grammar patterns and on-device translation.',
    )
    // The conjunction is a word, and not the same word in every language the
    // app is read in — which is why this goes through `Intl.ListFormat` rather
    // than a comma.
    expect(gapSummary(japanesePack, translateIn('de'), 'de')).toContain(' und ')
  })
})

describe('gapRow', () => {
  test('labels the row with the language, since All shows one row per pack', () => {
    expect(gapRow(japanesePack, 'patterns', t)).toBe('Japanese grammar patterns')
    expect(gapRow(japanesePack, 'onDeviceTranslation', t)).toBe('Japanese on-device translation')
  })
})

describe('gapExplanation', () => {
  test('says what happens instead, not only that something is missing', () => {
    // The badge alone says a thing is absent; the title is where the reader
    // finds out that the lines still get translated, by the local model.
    expect(gapExplanation(japanesePack, 'onDeviceTranslation', t)).toContain('local model')
    expect(gapExplanation(japanesePack, 'patterns', t)).toContain('Japanese')
  })
})
