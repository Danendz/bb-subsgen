import { describe, expect, test } from 'vitest'
import { pickVoice, speaks, type VoiceLike } from './speak'

/**
 * The Chinese voices Chrome actually reports on macOS, in the order it reports
 * them.
 *
 * Copied from a live `speechSynthesis.getVoices()` rather than invented, because
 * the bug this file exists to prevent was entirely about *order*: eight Apple
 * novelty voices sort ahead of every real one, so taking the first `zh-CN` match
 * picked `Eddy`. A tidied fixture would not have caught it.
 */
const MACOS: VoiceLike[] = [
  { name: 'Eddy (Chinese (China mainland))', lang: 'zh-CN', localService: true },
  { name: 'Eddy (Chinese (Taiwan))', lang: 'zh-TW', localService: true },
  { name: 'Flo (Chinese (China mainland))', lang: 'zh-CN', localService: true },
  { name: 'Flo (Chinese (Taiwan))', lang: 'zh-TW', localService: true },
  { name: 'Grandma (Chinese (China mainland))', lang: 'zh-CN', localService: true },
  { name: 'Grandma (Chinese (Taiwan))', lang: 'zh-TW', localService: true },
  { name: 'Grandpa (Chinese (China mainland))', lang: 'zh-CN', localService: true },
  { name: 'Grandpa (Chinese (Taiwan))', lang: 'zh-TW', localService: true },
  { name: 'Meijia', lang: 'zh-TW', localService: true },
  { name: 'Reed (Chinese (China mainland))', lang: 'zh-CN', localService: true },
  { name: 'Reed (Chinese (Taiwan))', lang: 'zh-TW', localService: true },
  { name: 'Rocko (Chinese (China mainland))', lang: 'zh-CN', localService: true },
  { name: 'Rocko (Chinese (Taiwan))', lang: 'zh-TW', localService: true },
  { name: 'Sandy (Chinese (China mainland))', lang: 'zh-CN', localService: true },
  { name: 'Sandy (Chinese (Taiwan))', lang: 'zh-TW', localService: true },
  { name: 'Shelley (Chinese (China mainland))', lang: 'zh-CN', localService: true },
  { name: 'Shelley (Chinese (Taiwan))', lang: 'zh-TW', localService: true },
  { name: 'Tingting', lang: 'zh-CN', localService: true },
  { name: 'Google 普通话（中国大陆）', lang: 'zh-CN', localService: false },
  { name: 'Google 粤語（香港）', lang: 'zh-HK', localService: false },
  { name: 'Google 國語（臺灣）', lang: 'zh-TW', localService: false },
]

const english: VoiceLike = { name: 'Samantha', lang: 'en-US', localService: true }
const kyoko: VoiceLike = { name: 'Kyoko', lang: 'ja-JP', localService: true }

describe('pickVoice', () => {
  test('takes the networked Google voice over anything installed locally', () => {
    expect(pickVoice(MACOS, 'zh-CN')?.name).toBe('Google 普通话（中国大陆）')
  })

  test('never picks a novelty voice while a real one exists', () => {
    // The regression this whole module was written for: `Eddy` is first in the
    // list and is a cartoon character voice.
    const local = MACOS.filter((v) => v.localService)
    expect(pickVoice(local, 'zh-CN')?.name).toBe('Tingting')
  })

  test('prefers Mandarin over Cantonese even when Cantonese sounds better', () => {
    // zh-HK is a different language, not an accent. A neural Cantonese voice
    // still loses to a robotic Mandarin one.
    const cantoneseAndTingting = [
      { name: 'Google 粤語（香港）', lang: 'zh-HK', localService: false },
      { name: 'Tingting', lang: 'zh-CN', localService: true },
    ]
    expect(pickVoice(cantoneseAndTingting, 'zh-CN')?.name).toBe('Tingting')
  })

  test('falls back to Cantonese only when there is no Mandarin voice at all', () => {
    const onlyCantonese = [{ name: 'Sinji', lang: 'zh-HK', localService: true }]
    expect(pickVoice(onlyCantonese, 'zh-CN')?.name).toBe('Sinji')
  })

  test('mainland breaks the tie between two voices of equal quality', () => {
    expect(pickVoice([...MACOS].reverse(), 'zh-CN')?.name).toBe('Google 普通话（中国大陆）')
  })

  test('honours a chosen voice outright, even a bad one', () => {
    // The user has heard both and picked. That is not a hint to weigh.
    expect(pickVoice(MACOS, 'zh-CN', 'Eddy (Chinese (China mainland))')?.name).toBe(
      'Eddy (Chinese (China mainland))',
    )
  })

  test('ignores a chosen voice that is not installed on this machine', () => {
    // Settings sync across computers; the voices do not.
    expect(pickVoice(MACOS, 'zh-CN', 'Microsoft Huihui Desktop')?.name).toBe(
      'Google 普通话（中国大陆）',
    )
  })

  test('skips voices that have already failed, which is the offline path', () => {
    const failed = new Set(['Google 普通话（中国大陆）', 'Google 國語（臺灣）'])
    expect(pickVoice(MACOS, 'zh-CN', '', failed)?.name).toBe('Tingting')
  })

  test('a chosen voice that has failed falls back rather than staying silent', () => {
    const failed = new Set(['Google 普通话（中国大陆）'])
    expect(pickVoice(MACOS, 'zh-CN', 'Google 普通话（中国大陆）', failed)?.name).toBe(
      'Google 國語（臺灣）',
    )
  })

  test('a novelty voice is still better than no audio', () => {
    // canSpeak() returning false withdraws audio cards from the rotation, so
    // ranking these last is not the same as dropping them.
    const noveltyOnly = MACOS.filter((v) => v.name.startsWith('Eddy'))
    expect(pickVoice(noveltyOnly, 'zh-CN')?.name).toBe('Eddy (Chinese (China mainland))')
  })

  test('gives up when the browser has no Chinese voice', () => {
    expect(pickVoice([english], 'zh-CN')).toBeNull()
    expect(pickVoice([], 'zh-CN')).toBeNull()
  })

  // Card audio follows the deck: a Japanese deck on a machine with both
  // installed must not be read out by the best Chinese voice on it.
  test("never crosses languages, however good the other language's voices are", () => {
    expect(pickVoice([...MACOS, kyoko], 'ja-JP')?.name).toBe('Kyoko')
    expect(pickVoice([...MACOS, kyoko], 'zh-CN')?.name).toBe('Google 普通话（中国大陆）')
  })

  test('ignores non-Chinese voices rather than ranking them', () => {
    expect(
      pickVoice([english, { name: 'Tingting', lang: 'zh-CN', localService: true }], 'zh-CN')?.name,
    ).toBe('Tingting')
  })
})

describe('speaks', () => {
  // The pair that made this a table rather than a prefix match: Cantonese has
  // to be recognised as Chinese in order to be ranked last, not filtered out.
  test('counts every tag the platforms label Mandarin and Cantonese with', () => {
    for (const tag of ['zh-CN', 'cmn-Hans-CN', 'yue-HK'])
      expect(speaks({ name: 'v', lang: tag, localService: true }, 'zh-CN')).toBe(true)
  })

  test('matches on the language, not the region it is spoken in', () => {
    expect(speaks(kyoko, 'ja')).toBe(true)
    expect(speaks(kyoko, 'ja-JP')).toBe(true)
  })

  test('a language nothing has resolved yet is spoken by nothing', () => {
    expect(speaks(kyoko, '')).toBe(false)
  })
})
