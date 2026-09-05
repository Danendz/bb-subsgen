import { describe, expect, test } from 'vitest'
import { staleTranslations, withTranslations } from './context-translation'
import type { Context } from './types'

const context = (patch: Partial<Context> = {}): Context => ({
  text: '他还活着',
  translation: "He's still alive",
  translationLang: 'en',
  at: 1700000000000,
  ...patch,
})

describe('staleTranslations', () => {
  test('leaves a card alone when it already answers in the language being read', () => {
    expect(staleTranslations([context()], 'en')).toEqual([])
  })

  test('finds the card captured before the target changed', () => {
    expect(staleTranslations([context()], 'es')).toEqual([{ index: 0, text: '他还活着' }])
  })

  // The capture path deliberately does not block on a translator, so an empty
  // translation is a normal state and not something to re-translate into.
  test('ignores a context that never had a translation', () => {
    expect(staleTranslations([context({ translation: '' })], 'es')).toEqual([])
  })

  // Schema 5 tagged everything already in the deck, so an untagged row now can
  // only have come from importing an old backup. Assuming it matches is the
  // assumption the tag exists to stop making.
  test('treats an untagged translation as stale rather than as matching', () => {
    expect(staleTranslations([context({ translationLang: undefined })], 'en')).toEqual([
      { index: 0, text: '他还活着' },
    ])
  })

  // A card can hold the same line twice, met in two places. Answers come back
  // addressed by position for exactly that reason.
  test('reports each context by position, so a repeated line is not conflated', () => {
    const contexts = [context(), context({ translationLang: 'es' }), context()]

    expect(staleTranslations(contexts, 'es')).toEqual([
      { index: 0, text: '他还活着' },
      { index: 2, text: '他还活着' },
    ])
  })
})

describe('withTranslations', () => {
  test('moves the text and the tag together', () => {
    const [updated] = withTranslations([context()], 'es', new Map([[0, 'Todavía está vivo']]))

    expect(updated.translation).toBe('Todavía está vivo')
    expect(updated.translationLang).toBe('es')
  })

  // `Context` freezes its translation because a card that cannot render its own
  // answer is worthless. A lookup that failed must leave the stale answer
  // standing rather than blank the card.
  test('keeps the stale answer when the re-translation produced nothing', () => {
    const [updated] = withTranslations([context()], 'es', new Map([[0, '   ']]))

    expect(updated.translation).toBe("He's still alive")
    expect(updated.translationLang).toBe('en')
  })

  test('a context nobody answered for is left exactly as it was', () => {
    const before = [context(), context({ text: '很好', translation: 'Very good' })]

    const after = withTranslations(before, 'es', new Map([[0, 'Todavía está vivo']]))

    expect(after[1]).toBe(before[1])
  })

  // The tag moving only where the text moved is what makes the card ask again
  // tomorrow instead of recording itself as done.
  test('leaves a failed card stale, so it is retried rather than marked done', () => {
    const after = withTranslations([context()], 'es', new Map())

    expect(staleTranslations(after, 'es')).toHaveLength(1)
  })

  test('returns the same array when there was nothing to apply', () => {
    const before = [context()]

    expect(withTranslations(before, 'es', new Map())).toBe(before)
  })
})
