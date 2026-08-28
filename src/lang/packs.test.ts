import { describe, expect, test } from 'vitest'
import { PACKS } from './packs'
import { DICT_SOURCES } from '../dict/sources'

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
})
