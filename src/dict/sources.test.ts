import { describe, expect, test } from 'vitest'
import { DICT_SOURCES, installedSources } from './sources'

describe('installedSources', () => {
  test('offers a language only once its dictionary is on disk', () => {
    // Enabled but never downloaded is the state the setup wizard leaves you in
    // between ticking a language and pressing Install. Switching to it there
    // would answer every lookup with nothing.
    expect(installedSources(['zh'], new Set())).toEqual([])
    expect(installedSources(['zh'], new Set(['zh']))).toEqual([DICT_SOURCES.zh])
  })

  test('ignores an installed language you have stopped studying', () => {
    expect(installedSources([], new Set(['zh']))).toEqual([])
  })

  test('skips a language with no source behind it, rather than yielding a hole', () => {
    // `enabledLanguages` is stored, and chrome.storage.sync outlives any one
    // version of the registry — a removed source must not become `undefined`
    // in a list the picker maps over.
    expect(installedSources(['xx'], new Set(['xx']))).toEqual([])
  })
})
