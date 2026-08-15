import { describe, expect, test } from 'vitest'
import { pickVoice, type VoiceLike } from './speak'

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

describe('pickVoice', () => {
  test('takes the networked Google voice over anything installed locally', () => {
    expect(pickVoice(MACOS)?.name).toBe('Google 普通话（中国大陆）')
  })

  test('never picks a novelty voice while a real one exists', () => {
    // The regression this whole module was written for: `Eddy` is first in the
    // list and is a cartoon character voice.
    const local = MACOS.filter((v) => v.localService)
    expect(pickVoice(local)?.name).toBe('Tingting')
  })

  test('prefers Mandarin over Cantonese even when Cantonese sounds better', () => {
    // zh-HK is a different language, not an accent. A neural Cantonese voice
    // still loses to a robotic Mandarin one.
    const cantoneseAndTingting = [
      { name: 'Google 粤語（香港）', lang: 'zh-HK', localService: false },
      { name: 'Tingting', lang: 'zh-CN', localService: true },
    ]
    expect(pickVoice(cantoneseAndTingting)?.name).toBe('Tingting')
  })

  test('falls back to Cantonese only when there is no Mandarin voice at all', () => {
    const onlyCantonese = [{ name: 'Sinji', lang: 'zh-HK', localService: true }]
    expect(pickVoice(onlyCantonese)?.name).toBe('Sinji')
  })

  test('mainland breaks the tie between two voices of equal quality', () => {
    expect(pickVoice([...MACOS].reverse())?.name).toBe('Google 普通话（中国大陆）')
  })

  test('honours a chosen voice outright, even a bad one', () => {
    // The user has heard both and picked. That is not a hint to weigh.
    expect(pickVoice(MACOS, 'Eddy (Chinese (China mainland))')?.name).toBe(
      'Eddy (Chinese (China mainland))',
    )
  })

  test('ignores a chosen voice that is not installed on this machine', () => {
    // Settings sync across computers; the voices do not.
    expect(pickVoice(MACOS, 'Microsoft Huihui Desktop')?.name).toBe('Google 普通话（中国大陆）')
  })

  test('skips voices that have already failed, which is the offline path', () => {
    const failed = new Set(['Google 普通话（中国大陆）', 'Google 國語（臺灣）'])
    expect(pickVoice(MACOS, '', failed)?.name).toBe('Tingting')
  })

  test('a chosen voice that has failed falls back rather than staying silent', () => {
    const failed = new Set(['Google 普通话（中国大陆）'])
    expect(pickVoice(MACOS, 'Google 普通话（中国大陆）', failed)?.name).toBe(
      'Google 國語（臺灣）',
    )
  })

  test('a novelty voice is still better than no audio', () => {
    // canSpeak() returning false withdraws audio cards from the rotation, so
    // ranking these last is not the same as dropping them.
    const noveltyOnly = MACOS.filter((v) => v.name.startsWith('Eddy'))
    expect(pickVoice(noveltyOnly)?.name).toBe('Eddy (Chinese (China mainland))')
  })

  test('gives up when the browser has no Chinese voice', () => {
    expect(pickVoice([english])).toBeNull()
    expect(pickVoice([])).toBeNull()
  })

  test('ignores non-Chinese voices rather than ranking them', () => {
    expect(pickVoice([english, { name: 'Tingting', lang: 'zh-CN', localService: true }])?.name)
      .toBe('Tingting')
  })
})
