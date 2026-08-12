/**
 * Runs `create` inside a user gesture when the browser demands one.
 *
 * `Translator.create()` requires transient user activation and throws
 * NotAllowedError otherwise, so it cannot run at document_start. Activation is
 * per-document, which also rules out driving it from the extension popup — the
 * gesture has to happen on the Bilibili page itself.
 *
 * Rather than always waiting, this tries immediately and only falls back to
 * listening for a gesture if the browser refuses. Watching a video always
 * involves a click (play, seek, volume), so the wait resolves on its own with
 * no UI and nothing to explain to the user.
 */

/** Gestures that grant transient activation and that a viewer will produce naturally. */
const GESTURES = ['pointerdown', 'keydown'] as const

function needsActivation(error: unknown): boolean {
  return (error as Error | undefined)?.name === 'NotAllowedError'
}

export interface ActivationOptions {
  target?: EventTarget
  /** Abort while waiting, so navigating away doesn't leave a listener behind. */
  signal?: AbortSignal
}

export function withUserActivation<T>(
  create: () => Promise<T>,
  { target = globalThis.window, signal }: ActivationOptions = {},
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const controller = new AbortController()

    const cleanup = () => controller.abort()

    const attempt = () => {
      create().then(
        (value) => {
          cleanup()
          resolve(value)
        },
        (error) => {
          // Keep waiting for another gesture; anything else is a real failure.
          if (needsActivation(error)) return
          cleanup()
          reject(error)
        },
      )
    }

    if (signal) {
      if (signal.aborted) {
        reject(new DOMException('Aborted before activation', 'AbortError'))
        return
      }
      signal.addEventListener(
        'abort',
        () => {
          cleanup()
          reject(new DOMException('Aborted while awaiting user activation', 'AbortError'))
        },
        { once: true },
      )
    }

    for (const gesture of GESTURES) {
      target.addEventListener(gesture, attempt, {
        capture: true,
        signal: controller.signal,
      })
    }

    attempt()
  })
}
