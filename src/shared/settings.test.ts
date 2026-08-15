import { describe, expect, test } from 'vitest'
import {
  clampSpeechRate,
  DEFAULT_SETTINGS,
  MAX_SPEECH_RATE,
  MIN_SPEECH_RATE,
  nextFontSize,
} from './settings'

describe('translation defaults', () => {
  test('translation is off until the user opts in', () => {
    // Keeps the overlay unchanged for existing users, and means no language
    // pack is ever downloaded unless the feature is actually wanted.
    expect(DEFAULT_SETTINGS.showTranslation).toBe(false)
  })

  test('the English line defaults smaller than the hanzi, so it reads as secondary', () => {
    expect(DEFAULT_SETTINGS.translationFontSize).toBeLessThan(DEFAULT_SETTINGS.fontSize)
  })

  test('the English line defaults to sharing the subtitle card', () => {
    expect(DEFAULT_SETTINGS.translationLayout).toBe('inline')
  })

  test('translates to English by default, so existing users see no change', () => {
    expect(DEFAULT_SETTINGS.translationLang).toBe('en')
  })
})

describe('control-bar avoidance defaults', () => {
  test('lifting above the player controls is on by default', () => {
    // At the default height the card sits directly under Bilibili's timeline,
    // so the collision is the common case, not the edge case.
    expect(DEFAULT_SETTINGS.liftAboveControls).toBe(true)
  })
})

describe('nextFontSize', () => {
  test('steps to the next size up', () => {
    expect(nextFontSize(32)).toBe(36)
  })

  test('wraps back to the smallest size after the largest', () => {
    expect(nextFontSize(46)).toBe(22)
  })

  test('rounds a value between steps up to the next defined step', () => {
    expect(nextFontSize(30)).toBe(32)
  })

  test('rounds a value below every defined step up to the smallest step', () => {
    expect(nextFontSize(10)).toBe(22)
  })
})

describe('clampSpeechRate', () => {
  test('keeps a rate the slider can produce', () => {
    expect(clampSpeechRate(0.75)).toBe(0.75)
  })

  test('holds the rate inside the range the voices stay intelligible in', () => {
    expect(clampSpeechRate(0.1)).toBe(MIN_SPEECH_RATE)
    expect(clampSpeechRate(4)).toBe(MAX_SPEECH_RATE)
  })

  test('falls back to the default rather than passing NaN to the utterance', () => {
    // An utterance with a NaN rate throws in Chrome, which would take the whole
    // card down over a corrupt settings value.
    expect(clampSpeechRate(Number.NaN)).toBe(DEFAULT_SETTINGS.speechRate)
  })

  test('the default sits inside its own bounds', () => {
    expect(DEFAULT_SETTINGS.speechRate).toBeGreaterThanOrEqual(MIN_SPEECH_RATE)
    expect(DEFAULT_SETTINGS.speechRate).toBeLessThanOrEqual(MAX_SPEECH_RATE)
  })

  test('no voice is chosen by default, so ranking decides', () => {
    expect(DEFAULT_SETTINGS.speechVoice).toBe('')
  })
})
