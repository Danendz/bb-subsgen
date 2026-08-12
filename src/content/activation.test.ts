import { describe, expect, test } from 'vitest'
import { withUserActivation } from './activation'

/** What Chrome throws when create() is called outside a user gesture. */
function notAllowed(): Error {
  const error = new Error('requires transient activation')
  error.name = 'NotAllowedError'
  return error
}

/** Lets pending promise chains settle before asserting. */
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

describe('withUserActivation', () => {
  test('resolves immediately when no gesture is required', async () => {
    const target = new EventTarget()
    let attempts = 0

    const result = await withUserActivation(
      async () => {
        attempts++
        return 'translator'
      },
      { target },
    )

    expect(result).toBe('translator')
    expect(attempts).toBe(1)
  })

  test('retries inside a pointer gesture when activation is required', async () => {
    const target = new EventTarget()
    let attempts = 0
    const create = async () => {
      attempts++
      if (attempts === 1) throw notAllowed()
      return 'translator'
    }

    const pending = withUserActivation(create, { target })
    await flush()
    expect(attempts).toBe(1) // still waiting — no gesture yet

    target.dispatchEvent(new Event('pointerdown'))

    await expect(pending).resolves.toBe('translator')
    expect(attempts).toBe(2)
  })

  test('accepts a keyboard gesture too', async () => {
    const target = new EventTarget()
    let attempts = 0
    const create = async () => {
      attempts++
      if (attempts === 1) throw notAllowed()
      return 'translator'
    }

    const pending = withUserActivation(create, { target })
    await flush()
    target.dispatchEvent(new Event('keydown'))

    await expect(pending).resolves.toBe('translator')
  })

  test('keeps waiting when a gesture still fails to grant activation', async () => {
    const target = new EventTarget()
    let attempts = 0
    const create = async () => {
      attempts++
      if (attempts < 3) throw notAllowed()
      return 'translator'
    }

    const pending = withUserActivation(create, { target })
    await flush()

    target.dispatchEvent(new Event('pointerdown'))
    await flush()
    expect(attempts).toBe(2) // second attempt also refused

    target.dispatchEvent(new Event('pointerdown'))
    await expect(pending).resolves.toBe('translator')
  })

  test('rejects a genuine failure instead of waiting forever', async () => {
    const target = new EventTarget()
    const create = async () => {
      throw new Error('model unavailable')
    }

    await expect(withUserActivation(create, { target })).rejects.toThrow('model unavailable')
  })

  test('stops listening once the translator is created', async () => {
    const target = new EventTarget()
    let attempts = 0
    const create = async () => {
      attempts++
      if (attempts === 1) throw notAllowed()
      return 'translator'
    }

    const pending = withUserActivation(create, { target })
    await flush()
    target.dispatchEvent(new Event('pointerdown'))
    await pending

    target.dispatchEvent(new Event('pointerdown'))
    await flush()
    expect(attempts).toBe(2) // the listener is gone, so no third attempt
  })

  test('gives up when aborted while waiting for a gesture', async () => {
    const target = new EventTarget()
    const controller = new AbortController()
    let attempts = 0
    const create = async () => {
      attempts++
      throw notAllowed()
    }

    const pending = withUserActivation(create, { target, signal: controller.signal })
    await flush()
    controller.abort()

    await expect(pending).rejects.toThrow(/abort/i)

    // Navigating away must not leave a listener that creates a stale translator.
    target.dispatchEvent(new Event('pointerdown'))
    await flush()
    expect(attempts).toBe(1)
  })
})
