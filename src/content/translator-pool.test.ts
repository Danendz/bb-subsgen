import { describe, expect, test, vi } from 'vitest'
import { createTranslatorPool, labelFor } from './translator-pool'
import type { TranslatorLike } from '../lang/translate'

const translator = (prefix: string): TranslatorLike => ({
  translate: async (text) => `${prefix}:${text}`,
})

describe('labelFor', () => {
  test('falls back to the bare code, so an unlabelled language still names itself', () => {
    expect(labelFor('en')).toBe('English')
    expect(labelFor('xx' as 'en')).toBe('xx')
  })
})

describe('createTranslatorPool', () => {
  test('two restarts arriving together share one creation instead of racing', async () => {
    const create = vi.fn(async () => translator('en'))
    const pool = createTranslatorPool(create)

    const [a, b] = await Promise.all([
      pool.translatorFor('en', () => {}),
      pool.translatorFor('en', () => {}),
    ])

    expect(create).toHaveBeenCalledTimes(1)
    expect(a).toBe(b)
  })

  /**
   * The usual cause is a page nobody has clicked yet, so the translator could
   * not take its user gesture. Remembering that rejection would mean the pass
   * never translates anything for the rest of the page, however many times it
   * restarts.
   */
  test('a failed creation is not remembered as the answer', async () => {
    const second = translator('en')
    const create = vi
      .fn<() => Promise<TranslatorLike>>()
      .mockRejectedValueOnce(new DOMException('no gesture yet', 'NotAllowedError'))
      .mockResolvedValueOnce(second)
    const pool = createTranslatorPool(create)

    await expect(pool.translatorFor('en', () => {})).rejects.toThrow('no gesture yet')
    await expect(pool.translatorFor('en', () => {})).resolves.toBe(second)
    expect(create).toHaveBeenCalledTimes(2)
  })

  test('keeps one translator per language, not one for the page', async () => {
    const create = vi.fn(async (lang: 'en' | 'ru') => translator(lang))
    const pool = createTranslatorPool(create)

    const en = await pool.translatorFor('en', () => {})
    const ru = await pool.translatorFor('ru', () => {})

    expect(await en.translate('好')).toBe('en:好')
    expect(await ru.translate('好')).toBe('ru:好')
    expect(create).toHaveBeenCalledTimes(2)
  })
})
