import { describe, expect, test } from 'vitest'
import { DEFAULT_SETTINGS, nextFontSize } from './settings'

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
