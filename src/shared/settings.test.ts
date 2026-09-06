import { afterEach, describe, expect, test } from 'vitest'
import {
  clampSpeechRate,
  DEFAULT_SETTINGS,
  isTranslationLang,
  loadSettings,
  MAX_SPEECH_RATE,
  MIN_SPEECH_RATE,
  nextFontSize,
  onSettingsChanged,
  resolveStudyLang,
  TRANSLATION_LANGS,
  type Settings,
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

describe('enabledLanguages default', () => {
  test('starts empty, even for an upgraded profile', () => {
    // The packaged dictionary is gone (#20): an install that upgraded from a
    // version that shipped one has nothing installed either, so it belongs in
    // the setup wizard exactly like a fresh profile.
    expect(DEFAULT_SETTINGS.enabledLanguages).toEqual([])
  })
})

describe('resolveStudyLang', () => {
  const settings = (patch: Partial<Settings>): Settings => ({ ...DEFAULT_SETTINGS, ...patch })

  test('honours the language you picked', () => {
    expect(resolveStudyLang(settings({ studyLang: 'ja', enabledLanguages: ['zh', 'ja'] }))).toBe(
      'ja',
    )
  })

  test('follows the wizard when nobody has touched the control', () => {
    // The control stays hidden while one dictionary is installed, so this is
    // the path almost every profile actually takes.
    expect(resolveStudyLang(settings({ enabledLanguages: ['ja'] }))).toBe('ja')
  })

  test('still names a language before the wizard has been through', () => {
    // Between installing the extension and finishing setup there is nothing to
    // resolve from, and a lookup keyed on '' would match nothing at all.
    expect(resolveStudyLang(settings({}))).toBe('zh')
  })

  test('ignores a language you have stopped studying', () => {
    // The wizard clears `studyLang` when it removes that language; this is the
    // belt to that braces, since the two settings are written separately.
    expect(resolveStudyLang(settings({ studyLang: '', enabledLanguages: ['zh'] }))).toBe('zh')
  })
})

/**
 * `readerOrigins` was a `string[]` until #11 and is a `ReaderOrigin[]` now.
 *
 * Driven through the real read paths rather than the migration directly:
 * `loadSettings` and `onSettingsChanged` each do their own shallow merge with
 * `DEFAULT_SETTINGS`, and a shallow merge is exactly what hands the old shape
 * through wearing the new type.
 */
describe('readerOrigins as it is read back', () => {
  const STORAGE_KEY = 'bbSubsgenSettings'
  let listener:
    ((changes: Record<string, chrome.storage.StorageChange>, area: string) => void) | null = null

  /** Stands in for `chrome.storage.sync` holding exactly `stored`. */
  function withStored(stored: unknown) {
    globalThis.chrome = {
      storage: {
        sync: { get: () => Promise.resolve({ [STORAGE_KEY]: stored }) },
        onChanged: {
          addListener: (fn: NonNullable<typeof listener>) => {
            listener = fn
          },
          removeListener: () => {
            listener = null
          },
        },
      },
    } as unknown as typeof chrome
  }

  afterEach(() => {
    listener = null
  })

  test('a profile that opted into sites before the change still reaches them', () => {
    withStored({ readerOrigins: ['https://zhihu.com', 'https://baidu.com'] })
    return expect(loadSettings().then((s) => s.readerOrigins)).resolves.toEqual([
      { origin: 'https://zhihu.com' },
      { origin: 'https://baidu.com' },
    ])
  })

  test('no code is invented for a site that was never asked', () => {
    // An absent code resolves per page; writing 'zh' here would record a
    // decision nobody made, and it would be the wrong one the moment a second
    // pack exists.
    withStored({ readerOrigins: ['https://zhihu.com'] })
    return expect(loadSettings().then((s) => s.readerOrigins[0].lang)).resolves.toBeUndefined()
  })

  test('an already-migrated list survives a second load unchanged', () => {
    withStored({ readerOrigins: [{ origin: 'https://nhk.or.jp', lang: 'ja' }] })
    return expect(loadSettings().then((s) => s.readerOrigins)).resolves.toEqual([
      { origin: 'https://nhk.or.jp', lang: 'ja' },
    ])
  })

  test('a junk entry is dropped rather than crashing the read', () => {
    // chrome.storage.sync is a JSON blob an older build wrote; a half-written
    // entry must cost that entry, not every setting the profile has.
    withStored({ readerOrigins: ['', null, 42, { lang: 'zh' }, { origin: 'https://ok.test' }] })
    return expect(loadSettings().then((s) => s.readerOrigins)).resolves.toEqual([
      { origin: 'https://ok.test' },
    ])
  })

  test('a storage echo migrates too, so nothing un-migrates the list', () => {
    // The echo path does its own merge. Missing it means any write to any
    // setting quietly hands the old shape back to whatever is subscribed.
    withStored({})
    const seen: Settings[] = []
    onSettingsChanged((next) => seen.push(next))
    listener?.({ [STORAGE_KEY]: { newValue: { readerOrigins: ['https://zhihu.com'] } } }, 'sync')
    expect(seen[0]?.readerOrigins).toEqual([{ origin: 'https://zhihu.com' }])
  })
})

describe('translationLang as it is read back', () => {
  const STORAGE_KEY = 'bbSubsgenSettings'

  /** Stands in for `chrome.storage.sync` holding exactly `stored`. */
  function withStored(stored: unknown) {
    globalThis.chrome = {
      storage: {
        sync: { get: () => Promise.resolve({ [STORAGE_KEY]: stored }) },
        onChanged: { addListener: () => {}, removeListener: () => {} },
      },
    } as unknown as typeof chrome
  }

  test('every offered language is one the union admits', () => {
    for (const lang of TRANSLATION_LANGS) {
      expect(isTranslationLang(lang.code)).toBe(true)
    }
  })

  // Settings are synced, so a profile can arrive from a build whose union had a
  // language this one has dropped. A shallow merge would hand it through typed
  // as a member, and `LANGUAGE_NAME[lang]` would then tell the model to reply in
  // `undefined`.
  test('a language this build no longer offers falls back to the default', async () => {
    withStored({ translationLang: 'kl' })

    expect((await loadSettings()).translationLang).toBe(DEFAULT_SETTINGS.translationLang)
  })

  test('a language it does offer is left alone', async () => {
    withStored({ translationLang: 'de' })

    expect((await loadSettings()).translationLang).toBe('de')
  })

  test('a profile that has never set one still reads a usable language', async () => {
    withStored({})

    expect(isTranslationLang((await loadSettings()).translationLang)).toBe(true)
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
