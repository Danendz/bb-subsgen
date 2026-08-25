import { describe, expect, test } from 'vitest'
import { readerEnabledFor, resolveReaderLang } from './reader-sites'
import { DEFAULT_SETTINGS, type ReaderOrigin, type Settings } from './settings'

const settings = (readerOrigins: ReaderOrigin[], patch: Partial<Settings> = {}): Settings => ({
  ...DEFAULT_SETTINGS,
  readerOrigins,
  ...patch,
})

describe('readerEnabledFor', () => {
  test('finds a site by its origin now that the list holds objects', () => {
    expect(readerEnabledFor(settings([{ origin: 'https://zhihu.com' }]), 'https://zhihu.com')).toBe(
      true,
    )
  })

  test('treats a different origin as a different site, port and scheme included', () => {
    // Chrome grants permission per origin, so the reader must not claim to be
    // on for a host it was never granted.
    const on = settings([{ origin: 'https://zhihu.com' }])
    expect(readerEnabledFor(on, 'http://zhihu.com')).toBe(false)
    expect(readerEnabledFor(on, 'https://www.zhihu.com')).toBe(false)
  })
})

describe('resolveReaderLang', () => {
  test('a site that was told its language keeps it, whatever you are studying', () => {
    // The point of #11: a Japanese site and a Chinese site cannot both be right
    // about one global setting.
    expect(
      resolveReaderLang(
        settings([{ origin: 'https://nhk.or.jp', lang: 'ja' }], { studyLang: 'zh' }),
        'https://nhk.or.jp',
      ),
    ).toBe('ja')
  })

  test('a site that was never told follows the study language', () => {
    // Every site opted into before #11 is this one, so this is the path that
    // has to keep behaving exactly as it did.
    expect(
      resolveReaderLang(
        settings([{ origin: 'https://zhihu.com' }], { studyLang: 'zh' }),
        'https://zhihu.com',
      ),
    ).toBe('zh')
  })

  test('an empty code is treated as no code rather than as a language', () => {
    expect(
      resolveReaderLang(
        settings([{ origin: 'https://zhihu.com', lang: '' }], { studyLang: 'ja' }),
        'https://zhihu.com',
      ),
    ).toBe('ja')
  })

  test('a site that is not on the list still answers with a language', () => {
    // The Bilibili reader is declared in the manifest and can be injected on a
    // page the list has never heard of; returning nothing would leave it with
    // no segmenter at all.
    expect(resolveReaderLang(settings([], { studyLang: 'zh' }), 'https://www.bilibili.com')).toBe(
      'zh',
    )
  })
})
