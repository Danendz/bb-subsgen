import { describe, expect, test } from 'vitest'
import { pickNext, runTranslationPass } from './translations'
import type { TranslatorLike } from '../lang/translate'

/** Records the order texts were handed to translate(), and echoes a marker. */
function recordingTranslator(onCall?: (text: string) => void): TranslatorLike & { calls: string[] } {
  const calls: string[] = []
  return {
    calls,
    async translate(text: string) {
      calls.push(text)
      onCall?.(text)
      return `en:${text}`
    },
  }
}

describe('pickNext', () => {
  test('picks the playhead index itself when it is still pending', () => {
    expect(pickNext(new Set([0, 1, 2]), 1)).toBe(1)
  })

  test('picks the nearest pending index after the playhead', () => {
    expect(pickNext(new Set([0, 3, 5]), 1)).toBe(3)
  })

  test('wraps to the lowest pending index when none follow the playhead', () => {
    expect(pickNext(new Set([0, 1]), 5)).toBe(0)
  })

  test('treats the no-active-cue sentinel as the start of the track', () => {
    // watchPlayback reports -1 between cues; the pass should just start at the top.
    expect(pickNext(new Set([2, 5]), -1)).toBe(2)
  })

  test('returns null when nothing is pending', () => {
    expect(pickNext(new Set(), 0)).toBe(null)
  })
})

describe('runTranslationPass', () => {
  test('translates every text exactly once', async () => {
    const translator = recordingTranslator()
    const results = new Map<number, string>()

    await runTranslationPass({
      texts: ['a', 'b', 'c'],
      translator,
      currentIndex: () => 0,
      onResult: (index, text) => results.set(index, text),
      signal: new AbortController().signal,
    })

    expect(translator.calls).toHaveLength(3)
    expect(results).toEqual(
      new Map([
        [0, 'en:a'],
        [1, 'en:b'],
        [2, 'en:c'],
      ]),
    )
  })

  test('starts at the playhead and wraps around to the beginning', async () => {
    const translator = recordingTranslator()

    await runTranslationPass({
      texts: ['a', 'b', 'c', 'd', 'e'],
      translator,
      currentIndex: () => 2,
      onResult: () => {},
      signal: new AbortController().signal,
    })

    expect(translator.calls).toEqual(['c', 'd', 'e', 'a', 'b'])
  })

  test('re-reads the playhead each iteration, so seeking re-prioritizes', async () => {
    let playhead = 0
    // Seek to the end of the track as soon as the first cue is done.
    const translator = recordingTranslator(() => {
      playhead = 4
    })

    await runTranslationPass({
      texts: ['a', 'b', 'c', 'd', 'e'],
      translator,
      currentIndex: () => playhead,
      onResult: () => {},
      signal: new AbortController().signal,
    })

    expect(translator.calls).toEqual(['a', 'e', 'b', 'c', 'd'])
  })

  test('continues past a cue that fails to translate', async () => {
    const calls: string[] = []
    const translator: TranslatorLike = {
      async translate(text) {
        calls.push(text)
        if (text === 'b') throw new Error('model hiccup')
        return `en:${text}`
      },
    }
    const results = new Map<number, string>()

    await runTranslationPass({
      texts: ['a', 'b', 'c'],
      translator,
      currentIndex: () => 0,
      onResult: (index, text) => results.set(index, text),
      signal: new AbortController().signal,
    })

    expect(calls).toEqual(['a', 'b', 'c'])
    expect(results).toEqual(
      new Map([
        [0, 'en:a'],
        [2, 'en:c'],
      ]),
    )
  })

  test('stops translating once aborted', async () => {
    const controller = new AbortController()
    const translator = recordingTranslator(() => controller.abort())

    await runTranslationPass({
      texts: ['a', 'b', 'c'],
      translator,
      currentIndex: () => 0,
      onResult: () => {},
      signal: controller.signal,
    })

    expect(translator.calls).toEqual(['a'])
  })

  test('reports no result for a cue whose translation resolved after aborting', async () => {
    const controller = new AbortController()
    const translator: TranslatorLike = {
      async translate(text) {
        controller.abort()
        return `en:${text}`
      },
    }
    const results = new Map<number, string>()

    await runTranslationPass({
      texts: ['a', 'b'],
      translator,
      currentIndex: () => 0,
      onResult: (index, text) => results.set(index, text),
      signal: controller.signal,
    })

    // Navigating away mid-flight must not paint stale English over the new video.
    expect(results.size).toBe(0)
  })

  test('does nothing for an empty track', async () => {
    const translator = recordingTranslator()
    await runTranslationPass({
      texts: [],
      translator,
      currentIndex: () => 0,
      onResult: () => {},
      signal: new AbortController().signal,
    })
    expect(translator.calls).toEqual([])
  })

  test('skips blank cues without calling the translator', async () => {
    const translator = recordingTranslator()
    const results = new Map<number, string>()

    await runTranslationPass({
      texts: ['a', '   ', 'c'],
      translator,
      currentIndex: () => 0,
      onResult: (index, text) => results.set(index, text),
      signal: new AbortController().signal,
    })

    expect(translator.calls).toEqual(['a', 'c'])
    expect(results.has(1)).toBe(false)
  })
})
