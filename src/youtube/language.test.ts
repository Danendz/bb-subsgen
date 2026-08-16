import { describe, expect, test } from 'vitest'
import { confidenceOf, hanRatio, isChineseLanguage, looksChinese } from './language'
import type { CaptionTrack } from './player-response'

/** The video this feature was designed against, verified live. */
const DRAMA = {
  title:
    '#杨紫 租”狂野男孩“假扮男友 故意惹夏梅生气《家有儿女》第一季第1集 ' +
    'Home With Kids Season 1 EP. 1【中国电视剧精选】#yangzi #lostyouforever',
  author: '中国电视剧精选 Chinese Drama',
}

const track = (over: Partial<CaptionTrack> = {}): CaptionTrack => ({
  baseUrl: 'https://youtube.com/api/timedtext?x=1',
  languageCode: 'en',
  name: 'English',
  ...over,
})

describe('hanRatio', () => {
  test('scores a bilingual Chinese title well above a Latin one', () => {
    expect(hanRatio(DRAMA.title)).toBeGreaterThan(0.4)
    expect(hanRatio(DRAMA.author)).toBeGreaterThan(0.3)
    expect(hanRatio('Rick Astley - Never Gonna Give You Up')).toBe(0)
  })

  test('ignores punctuation, digits and spacing', () => {
    // Otherwise an uploader fond of brackets scores lower than one who is not,
    // for a title in the same language.
    expect(hanRatio('你好')).toBe(1)
    expect(hanRatio('【【【 你好 】】】 !!! 123')).toBe(1)
  })

  test('is zero for a string with no letters at all', () => {
    expect(hanRatio('123 !!! ---')).toBe(0)
  })
})

describe('looksChinese', () => {
  test('accepts the real title and channel name', () => {
    expect(looksChinese(DRAMA.title)).toBe(true)
    expect(looksChinese(DRAMA.author)).toBe(true)
  })

  test('accepts a Chinese drama titled for an English audience', () => {
    expect(looksChinese('【ENG SUB】甄嬛传 第1集')).toBe(true)
  })

  test('rejects ordinary English titles', () => {
    expect(looksChinese('Home With Kids Season 1 EP. 1')).toBe(false)
    expect(looksChinese('Lofi hip hop radio')).toBe(false)
  })

  test('rejects a single stray Han character in an English title', () => {
    // One 漢 in a hundred Latin letters is a logo or a loanword, not a language.
    expect(looksChinese('The history of the 漢 dynasty explained for beginners')).toBe(false)
  })
})

describe('isChineseLanguage', () => {
  test('accepts every spelling YouTube uses', () => {
    for (const code of ['zh', 'zh-Hans', 'zh-Hant', 'zh-CN', 'zh-TW', 'zh-HK']) {
      expect(isChineseLanguage(code)).toBe(true)
    }
  })

  test('is not fooled by a code that merely starts with the same letters', () => {
    expect(isChineseLanguage('zhx')).toBe(false)
    expect(isChineseLanguage('en')).toBe(false)
  })
})

describe('confidenceOf', () => {
  test('is certain when an auto-generated track says the audio is Chinese', () => {
    // The one signal that cannot be a translation: it was produced from the audio.
    expect(
      confidenceOf({
        title: 'Some English Title',
        author: 'Some Channel',
        captionTracks: [track({ kind: 'asr', languageCode: 'zh-Hans' })],
      }),
    ).toBe('certain')
  })

  test('stands down when an auto-generated track says the audio is not Chinese', () => {
    // Even with a Chinese track sitting beside it — that one is a human
    // translation of foreign audio, and is the case this exists to refuse.
    expect(
      confidenceOf({
        title: '中文标题看起来很像中文',
        author: '中文频道',
        captionTracks: [
          track({ kind: 'asr', languageCode: 'en' }),
          track({ languageCode: 'zh-Hans' }),
        ],
      }),
    ).toBe('negative')
  })

  test('is certain on the real drama upload, which has no auto track at all', () => {
    // The load-bearing path: drama re-uploads carry hand-made English subs and
    // no auto-generated track, so the title and channel name are all there is.
    expect(confidenceOf({ ...DRAMA, captionTracks: [track({ languageCode: 'en' })] })).toBe(
      'certain',
    )
  })

  test('is only likely on a single clue', () => {
    expect(confidenceOf({ title: '甄嬛传 第1集', author: 'AsianCrush', captionTracks: [] })).toBe(
      'likely',
    )
    expect(
      confidenceOf({ title: 'Empresses in the Palace Ep 1', author: '中国电视剧精选', captionTracks: [] }),
    ).toBe('likely')
  })

  test('is uncertain with no clue either way', () => {
    expect(
      confidenceOf({ title: 'Home With Kids Season 1', author: 'AsianCrush', captionTracks: [] }),
    ).toBe('uncertain')
  })

  test('does not treat a human Chinese track as evidence on its own', () => {
    // Consistent with a Chinese video and with a translated English one alike,
    // so on its own it decides nothing and the notice asks instead.
    expect(
      confidenceOf({
        title: 'A Documentary About Trains',
        author: 'Trains Weekly',
        captionTracks: [track({ languageCode: 'zh-Hans', name: '中文' })],
      }),
    ).toBe('uncertain')
  })
})
