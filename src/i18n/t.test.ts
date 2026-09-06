import { describe, expect, test } from 'vitest'
import { translate, translateIn } from './t'
import { en } from './en'
import { ru } from './ru'
import { es } from './es'
import { fr } from './fr'
import { de } from './de'
import { pt } from './pt'
import type { Messages } from './keys'
import type { Message } from './message'

const LOCALES: Array<[string, Messages]> = [
  ['ru', ru],
  ['es', es],
  ['fr', fr],
  ['de', de],
  ['pt', pt],
]

/** Every `{name}` a message asks the caller for. */
function slotsOf(message: Message): Set<string> {
  const forms = typeof message === 'string' ? [message] : Object.values(message)
  const found = new Set<string>()
  for (const form of forms) {
    for (const match of form.matchAll(/\{(\w+)\}/g)) found.add(match[1])
  }
  return found
}

describe('translate', () => {
  test('fills a placeholder from the params, and leaves an unasked-for one alone', () => {
    expect(translate('en', 'settings.sites.already', { host: 'zhihu.com' })).toBe(
      'zhihu.com is already on.',
    )
    // A missing param renders the braces rather than "undefined", so a bad call
    // is visible in the UI as the key it forgot rather than as a plausible word.
    expect(translate('en', 'settings.sites.already')).toContain('{host}')
  })

  test('groups a number the way the reader writes numbers, not the way the browser does', () => {
    // The whole point of the locale following the setting: a Russian reader on
    // an English-locale browser still gets 12 345.
    expect(translate('en', 'dict.showMore', { count: 12345 })).toContain('12,345')
    expect(translate('ru', 'dict.showMore', { count: 12345 })).toMatch(/12\s345/)
  })

  test('picks the Russian plural form by category, not by "is it one"', () => {
    // 2–4 take a different ending from 5+, which no `n === 1 ? '' : 's'` can express.
    expect(translate('ru', 'review.cards', { count: 1 })).toBe('1 карточка')
    expect(translate('ru', 'review.cards', { count: 3 })).toBe('3 карточки')
    expect(translate('ru', 'review.cards', { count: 7 })).toBe('7 карточек')
  })

  test('falls back to `other` for a category the locale did not write', () => {
    // English has no `few`; asking for three must not render undefined.
    expect(translate('en', 'review.cards', { count: 3 })).toBe('3 cards')
  })

  test('a plural message with no count still renders, rather than blanking', () => {
    expect(translate('en', 'review.cards')).toBe('{count} cards')
  })
})

describe('translateIn', () => {
  test('binds one language, so a caller holding a lang need not repeat it', () => {
    expect(translateIn('de')('review.done')).toBe('Fertig')
  })
})

/** Keys whose English value legitimately survives translation into some target. */
const SAME_IN_SOME_TARGET = new Set<keyof typeof en>([
  // Proper nouns and number templates.
  'overview.hsk',
  'overview.hskLevel',
  'session.score',
  'videos.times',
  'dict.times',
  'data.shape.json',
  'data.conflicts.more',
  'popup.coveragePercent',
  // Words borrowed unchanged by at least one target.
  'app.tab.chat',
  'app.tab.videos',
  'log.kind.chat',
  'settings.server',
  'settings.rail.general',
  'controls.sections',
  'session.correct',
  'session.structure',
  'videos.back',
  'data.rail.diagnostics',
])

describe('the locale tables', () => {
  // The compiler already enforces that no key is missing. What it cannot see is
  // a translated string that dropped a placeholder — which renders as a message
  // silently missing its number, not as an error.
  test.each(LOCALES)('%s asks the caller for exactly the slots English does', (_code, locale) => {
    for (const key of Object.keys(en) as Array<keyof typeof en>) {
      expect([key, [...slotsOf(locale[key])].sort()]).toEqual([key, [...slotsOf(en[key])].sort()])
    }
  })

  test.each(LOCALES)('%s is written in its own language, not left as English', (_code, locale) => {
    // A key left as its English value is how an untranslated string hides from
    // the compiler: `Messages` says it must be there, not that anyone touched
    // it. Everything below is a value that is genuinely the same in at least
    // one target — a proper noun, a number template, or a borrowed word — and
    // an addition here should be a deliberate one.
    const identical = (Object.keys(en) as Array<keyof typeof en>).filter(
      (key) => JSON.stringify(locale[key]) === JSON.stringify(en[key]),
    )
    expect(identical.filter((key) => !SAME_IN_SOME_TARGET.has(key))).toEqual([])
  })
})
