import { describe, expect, test } from 'vitest'
import { sectionOf } from './section-route'

const SETTINGS = ['general', 'studying', 'language', 'models'] as const

describe('sectionOf', () => {
  test('opens on the first section when the tab is reached without one', () => {
    expect(sectionOf('/settings', '/settings', SETTINGS)).toBe('general')
  })

  test('reads the section a deep link names, so a bookmark survives', () => {
    expect(sectionOf('/settings/models', '/settings', SETTINGS)).toBe('models')
  })

  test('falls back rather than leaving the pane empty beside a lit rail', () => {
    expect(sectionOf('/settings/nonsense', '/settings', SETTINGS)).toBe('general')
  })

  test('a trailing slash is the bare tab, not a section named ""', () => {
    expect(sectionOf('/settings/', '/settings', SETTINGS)).toBe('general')
  })

  test('ignores anything past the section, so a future third level cannot break it', () => {
    expect(sectionOf('/settings/models/chat', '/settings', SETTINGS)).toBe('models')
  })

  // The Data rail has `word-lists`; a startsWith match on a shorter slug would
  // claim it. The prefix is matched exactly for the same reason.
  test('matches the whole slug, not a slug that starts it', () => {
    const data = ['backup', 'word', 'word-lists'] as const
    expect(sectionOf('/data/word-lists', '/data', data)).toBe('word-lists')
    expect(sectionOf('/settingsomething', '/settings', SETTINGS)).toBe('general')
  })
})
