import { describe, expect, test } from 'vitest'
import { DICT_SOURCES, enabledSources, installedSources } from './sources'

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

describe('enabledSources', () => {
  test('keeps a language you chose and never downloaded, for the filter to show as owed', () => {
    // The one list that is allowed to contain a language nothing can look up:
    // the filter offers it disabled, which is the only place outside the wizard
    // that says the download is still outstanding.
    expect(enabledSources(['zh', 'ja'])).toEqual([DICT_SOURCES.zh, DICT_SOURCES.ja])
  })

  test('still drops a language whose source has left the registry', () => {
    expect(enabledSources(['xx'])).toEqual([])
  })
})
