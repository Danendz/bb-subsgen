import { describe, expect, test, vi } from 'vitest'
import { translateGlosses, type GlossTranslateDeps } from './gloss-translate'
import type { TranslatorLike } from '../lang/translate'

const translator = (prefix = 'es'): TranslatorLike => ({
  translate: async (text) => `${prefix}:${text}`,
})

/** Everything wired to succeed and remember nothing, overridden per test. */
function deps(patch: Partial<GlossTranslateDeps> = {}): GlossTranslateDeps {
  return {
    translator: async () => translator(),
    viaModel: async (senses) => senses.map((s) => `model:${s}`),
    read: async () => ({}),
    write: async () => {},
    ...patch,
  }
}

const request = (headword: string, ...senses: string[]) => ({ headword, senses })

describe('translateGlosses', () => {
  test('leaves English alone — the dictionaries are already in it', async () => {
    const translate = vi.fn()

    const out = await translateGlosses([request('生', 'life')], 'en', {
      ...deps(),
      translator: translate,
    })

    expect(out).toEqual({})
    expect(translate).not.toHaveBeenCalled()
  })

  test('translates each sense on its own, so the separator is never translated too', async () => {
    const out = await translateGlosses([request('生', 'life', 'to be born')], 'es', deps())

    expect(out['生']).toEqual(['es:life', 'es:to be born'])
  })

  test('asks for nothing it already has', async () => {
    const translate = vi.fn()

    const out = await translateGlosses([request('生', 'life')], 'es', {
      ...deps({ read: async () => ({ 生: ['vida'] }) }),
      translator: translate,
    })

    expect(out['生']).toEqual(['vida'])
    expect(translate).not.toHaveBeenCalled()
  })

  test('falls back to the model where Chrome has no en→target pair', async () => {
    const out = await translateGlosses(
      [request('生', 'life')],
      'es',
      deps({ translator: async () => null }),
    )

    expect(out['生']).toEqual(['model:life'])
  })

  // A pair Chrome refuses throws rather than resolving null on some builds, and
  // a learner should not lose definitions to the difference.
  test('falls back to the model when building the translator throws', async () => {
    const out = await translateGlosses(
      [request('生', 'life')],
      'es',
      deps({
        translator: async () => {
          throw new Error('NotSupportedError')
        },
      }),
    )

    expect(out['生']).toEqual(['model:life'])
  })

  // The caller shows the English it already holds. Caching a blank would make
  // that fallback permanent for the word it failed on.
  test('caches nothing for a word that came back empty', async () => {
    const write = vi.fn()

    const out = await translateGlosses([request('生', 'life')], 'es', {
      ...deps({ write }),
      translator: async () => ({ translate: async () => '  ' }),
    })

    expect(out['生']).toBeUndefined()
    expect(write).not.toHaveBeenCalled()
  })

  test('one word failing does not cost the words that worked', async () => {
    let calls = 0
    const out = await translateGlosses([request('生', 'life'), request('好', 'good')], 'es', {
      ...deps(),
      translator: async () => ({
        translate: async (text) => {
          if (++calls === 1) throw new Error('translator died')
          return `es:${text}`
        },
      }),
    })

    expect(out['生']).toBeUndefined()
    expect(out['好']).toEqual(['es:good'])
  })

  // The worker is torn down when it goes idle. An unawaited write is one that
  // loses that race, and the word is re-translated on every hover forever.
  test('writes what it translated before returning it', async () => {
    const order: string[] = []

    await translateGlosses([request('生', 'life')], 'es', {
      ...deps({
        write: async (entries) => {
          order.push(`write:${[...entries.keys()].join(',')}`)
        },
      }),
    })
    order.push('returned')

    expect(order).toEqual(['write:生', 'returned'])
  })

  test('does not go to storage at all when asked for nothing', async () => {
    const read = vi.fn()

    expect(await translateGlosses([], 'es', { ...deps(), read })).toEqual({})
    expect(read).not.toHaveBeenCalled()
  })
})
