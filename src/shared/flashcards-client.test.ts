// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { createExposureBuffer, watchKnownSet } from './flashcards-client'
import { KNOWN_SET_KEY } from '../flashcards/known'
import type { FlashcardsMessage } from './messages'
import type { ExposureBatch } from '../flashcards/types'

let sent: FlashcardsMessage[]
let storage: Record<string, unknown>
let changeListeners: Array<
  (changes: Record<string, chrome.storage.StorageChange>, area: string) => void
>

beforeEach(() => {
  vi.useFakeTimers()
  sent = []
  storage = {}
  changeListeners = []

  globalThis.chrome = {
    runtime: {
      sendMessage: (msg: FlashcardsMessage) => {
        sent.push(msg)
        return Promise.resolve()
      },
    },
    storage: {
      local: { get: (key: string) => Promise.resolve({ [key]: storage[key] }) },
      onChanged: {
        addListener: (fn: (typeof changeListeners)[number]) => changeListeners.push(fn),
        removeListener: (fn: (typeof changeListeners)[number]) => {
          changeListeners = changeListeners.filter((l) => l !== fn)
        },
      },
    },
  } as unknown as typeof chrome
})

afterEach(() => {
  vi.useRealTimers()
})

/** The batches posted so far, in order. */
function batches(): ExposureBatch[] {
  return sent
    .filter((msg) => msg.type === 'bb-subsgen:record-exposures')
    .map((msg) => (msg as Extract<FlashcardsMessage, { batch: ExposureBatch }>).batch)
}

const video = { videoId: 'BV1xx', title: 'Test', url: 'https://b.tv/BV1xx' }

describe('createExposureBuffer', () => {
  test('posts nothing until the interval elapses', () => {
    // The whole point: a subtitle line changes every few seconds and carries
    // ~8 words, so writing per line would be thousands of messages per video.
    const buffer = createExposureBuffer(video)
    buffer.line(['我', '喜欢'])
    buffer.line(['我'])
    expect(batches()).toEqual([])

    vi.advanceTimersByTime(15_000)
    expect(batches()).toEqual([
      { video, lines: 2, words: { 我: 2, 喜欢: 1 } },
    ])
    buffer.stop()
  })

  test('counts a word repeated within one line', () => {
    const buffer = createExposureBuffer(video)
    buffer.line(['一', '一'])
    buffer.flush()
    expect(batches()[0].words).toEqual({ 一: 2 })
    buffer.stop()
  })

  test('starts empty again after a flush', () => {
    // A leaked accumulator would double-count every word for the whole video.
    const buffer = createExposureBuffer(video)
    buffer.line(['我'])
    buffer.flush()
    buffer.line(['你'])
    buffer.flush()

    expect(batches().map((b) => b.words)).toEqual([{ 我: 1 }, { 你: 1 }])
    buffer.stop()
  })

  test('an empty line is not a line', () => {
    // Cues of pure punctuation or music markers shouldn't inflate the line
    // count that per-video stats are read from.
    const buffer = createExposureBuffer(video)
    buffer.line([])
    buffer.flush()
    expect(batches()).toEqual([])
    buffer.stop()
  })

  test('flushing with nothing buffered posts nothing', () => {
    const buffer = createExposureBuffer(video)
    buffer.flush()
    buffer.flush()
    expect(batches()).toEqual([])
    buffer.stop()
  })

  test('stop posts what is left', () => {
    // Navigating between videos in the SPA tears the buffer down; without this
    // the last unflushed stretch of every video would be lost.
    const buffer = createExposureBuffer(video)
    buffer.line(['我'])
    buffer.stop()
    expect(batches()).toEqual([{ video, lines: 1, words: { 我: 1 } }])
  })

  test('pagehide posts what is left', () => {
    // Closing the tab is the common ending for a session and never reaches
    // the interval.
    const buffer = createExposureBuffer(video)
    buffer.line(['我'])
    window.dispatchEvent(new Event('pagehide'))
    expect(batches()).toEqual([{ video, lines: 1, words: { 我: 1 } }])
    buffer.stop()
  })

  test('stop detaches, so a later pagehide posts nothing', () => {
    const buffer = createExposureBuffer(video)
    buffer.line(['我'])
    buffer.stop()
    sent = []

    window.dispatchEvent(new Event('pagehide'))
    vi.advanceTimersByTime(60_000)
    expect(batches()).toEqual([])
  })

  test('works with no video, for the reader on an ordinary page', () => {
    const buffer = createExposureBuffer()
    buffer.line(['我'])
    buffer.flush()
    expect(batches()[0].video).toBeUndefined()
    buffer.stop()
  })
})

describe('watchKnownSet', () => {
  test('reports what is already stored', async () => {
    storage[KNOWN_SET_KEY] = ['我', '我们']
    const seen: Array<Set<string>> = []
    watchKnownSet((known) => seen.push(known))
    await vi.waitFor(() => expect(seen).toHaveLength(1))

    expect([...seen[0]]).toEqual(['我', '我们'])
  })

  test('reports an empty set when nothing has been stored yet', async () => {
    const seen: Array<Set<string>> = []
    watchKnownSet((known) => seen.push(known))
    await vi.waitFor(() => expect(seen).toHaveLength(1))

    expect(seen[0].size).toBe(0)
  })

  test('follows later changes, so marking a word known takes effect live', async () => {
    const seen: Array<Set<string>> = []
    watchKnownSet((known) => seen.push(known))
    await vi.waitFor(() => expect(seen).toHaveLength(1))

    for (const listener of changeListeners) {
      listener({ [KNOWN_SET_KEY]: { newValue: ['我'] } }, 'local')
    }
    expect([...seen[1]]).toEqual(['我'])
  })

  test('ignores unrelated keys and other storage areas', async () => {
    const seen: Array<Set<string>> = []
    watchKnownSet((known) => seen.push(known))
    await vi.waitFor(() => expect(seen).toHaveLength(1))

    for (const listener of changeListeners) {
      // The settings key lives in sync and changes far more often than this one.
      listener({ bbSubsgenSettings: { newValue: {} } }, 'sync')
      listener({ [KNOWN_SET_KEY]: { newValue: ['我'] } }, 'sync')
    }
    expect(seen).toHaveLength(1)
  })

  test('unsubscribing stops the updates', async () => {
    const seen: Array<Set<string>> = []
    const stop = watchKnownSet((known) => seen.push(known))
    await vi.waitFor(() => expect(seen).toHaveLength(1))

    stop()
    expect(changeListeners).toHaveLength(0)
  })
})
