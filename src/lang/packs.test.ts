import { describe, expect, test } from 'vitest'
import { PACKS, packsInScope } from './packs'
import { DICT_SOURCES } from '../dict/sources'
import { translateIn } from '../i18n/t'
import { TRANSLATION_LANGS } from '../shared/settings'

describe('PACKS', () => {
  // The two registries are separate modules on purpose and neither imports the
  // other, so nothing but this test stops them disagreeing. A language in
  // DICT_SOURCES with no pack downloads a dictionary nothing can read; a pack
  // with no source can never be given one.
  test('a language you can download is a language you can read', () => {
    expect(Object.keys(PACKS).sort()).toEqual(Object.keys(DICT_SOURCES).sort())
  })

  test('a pack answers to the code it is filed under', () => {
    for (const [code, pack] of Object.entries(PACKS)) expect(pack.code).toBe(code)
  })

  // The compiler only says the key exists. What a task label needs is that it
  // says something different per language in every locale — a table that
  // answered 'Chinese' in Spanish, or the same word for both packs, would tell
  // a Japanese deck to build its line in Chinese all over again.
  test('every pack names itself, in each of the six languages the app is read in', () => {
    for (const { code: lang } of TRANSLATION_LANGS) {
      const t = translateIn(lang)
      const names = Object.values(PACKS).map((pack) => t(pack.nameKey))
      for (const name of names) expect(name).not.toBe('')
      expect(new Set(names).size).toBe(names.length)
    }
  })
})

describe('packsInScope', () => {
  test('All is every enabled language, so a row survives on the one language that needs it', () => {
    expect(packsInScope('', ['zh', 'ja']).map((pack) => pack.code)).toEqual(['zh', 'ja'])
  })

  test('one chosen language answers with itself alone', () => {
    expect(packsInScope('ja', ['zh', 'ja']).map((pack) => pack.code)).toEqual(['ja'])
  })

  // A profile enabled before a pack was removed, or written by a newer version:
  // the row it would have gated is simply not asked for.
  test('drops a code no pack answers to rather than rendering against nothing', () => {
    expect(packsInScope('', ['zh', 'kr']).map((pack) => pack.code)).toEqual(['zh'])
  })

  // Before the wizard has run. Narrowing to nothing would hide the tone and
  // traditional rows from someone who has not yet chosen a language at all,
  // which reads as a broken settings page rather than as a filter.
  test('answers with every pack when nothing has been enabled yet', () => {
    expect(packsInScope('', [])).toEqual(Object.values(PACKS))
    expect(packsInScope('kr', [])).toEqual(Object.values(PACKS))
  })
})
