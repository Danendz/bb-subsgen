import { beforeEach, describe, expect, test, vi } from 'vitest'
import {
  cancelTranscription,
  handleOffscreenEvent,
  reportAsrPlayhead,
  retryTranscription,
  startTranscription,
  transcriptStatus,
  watchAsrTab,
} from './asr-pass'
import { OFFSCREEN_TARGET } from '../offscreen/protocol'

// This file is about routing and about what survives a worker restart. The
// cache has its own tests, and leaving it real made one test's finished
// transcript answer the next test's request.
vi.mock('./transcript-cache', () => ({
  readTranscript: vi.fn(() => Promise.resolve([])),
  writeTranscript: vi.fn(() => Promise.resolve()),
  evictTranscripts: vi.fn(() => Promise.resolve(0)),
}))

const TAB = 7
const OTHER_TAB = 9

const AUDIO = {
  url: 'https://cdn/lo',
  durationSeconds: 3000,
  via: 'page',
} as const

const request = (over: Partial<Parameters<typeof startTranscription>[1]> = {}) => ({
  videoId: 'ep335910',
  audio: AUDIO,
  model: 'large-v3-turbo-q8_0',
  baseUrl: 'http://localhost:8080/v1',
  playhead: 0,
  ...over,
})

/** What the tab was told, in order. */
let toTab: Array<{ tabId: number; message: Record<string, unknown> }>
/** What was put on the extension bus — the offscreen document's instructions. */
let onBus: Array<Record<string, unknown>>

/**
 * Lets pending promises run.
 *
 * Routing an offscreen event is now asynchronous — who asked is a read from
 * session storage — while the entry point still answers synchronously, so a
 * test has to give the routing a turn before asking what was sent.
 */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

/** A fake of the half of chrome.runtime.Port that matters here. */
function fakePort(tabId: number | undefined) {
  const handlers: Array<() => void> = []
  return {
    port: {
      sender: tabId === undefined ? {} : { tab: { id: tabId } },
      onDisconnect: { addListener: (fn: () => void) => handlers.push(fn) },
    } as unknown as chrome.runtime.Port,
    disconnect: () => handlers.forEach((fn) => fn()),
  }
}

beforeEach(async () => {
  toTab = []
  onBus = []
  // Memory-backed, like the real thing. The run's state lives here rather than
  // in a variable so it survives the worker being torn down mid-transcription.
  const session = new Map<string, unknown>()
  vi.stubGlobal('chrome', {
    storage: {
      session: {
        get: (key: string) => Promise.resolve(session.has(key) ? { [key]: session.get(key) } : {}),
        set: (items: Record<string, unknown>) => {
          for (const [key, value] of Object.entries(items)) session.set(key, value)
          return Promise.resolve()
        },
        remove: (key: string) => {
          session.delete(key)
          return Promise.resolve()
        },
      },
    },
    tabs: {
      sendMessage: (tabId: number, message: Record<string, unknown>) => {
        toTab.push({ tabId, message })
        return Promise.resolve()
      },
    },
    runtime: {
      sendMessage: (message: Record<string, unknown>) => {
        onBus.push(message)
        return Promise.resolve()
      },
      getContexts: () => Promise.resolve([]),
    },
    offscreen: {
      createDocument: () => Promise.resolve(),
      closeDocument: () => Promise.resolve(),
    },
  })
  // Whatever a previous test left running, so each starts with no active run.
  // The cancel itself talks to the bus, so the records are cleared after it
  // rather than before — otherwise every test opens with a message it did not send.
  await cancelTranscription()
  toTab = []
  onBus = []
})

describe('starting a run', () => {
  test('sends the request on to the offscreen document', async () => {
    await startTranscription(TAB, request())

    expect(onBus).toEqual([
      expect.objectContaining({
        type: 'bb-subsgen:offscreen-transcribe',
        target: OFFSCREEN_TARGET,
        videoId: 'ep335910',
        audio: AUDIO,
      }),
    ])
  })
})

describe('a duplicate request', () => {
  test('leaves a run for the same video alone', async () => {
    await startTranscription(TAB, request())
    await startTranscription(TAB, request())

    // One instruction, and crucially no cancel: cancelling closes the offscreen
    // document, which severs the request the speech server is working on.
    expect(onBus).toHaveLength(1)
    expect(onBus).not.toContainEqual(
      expect.objectContaining({ type: 'bb-subsgen:offscreen-cancel' }),
    )
  })

  test('still restarts for a different video', async () => {
    await startTranscription(TAB, request())
    await startTranscription(TAB, request({ videoId: 'ep335911' }))

    expect(onBus).toContainEqual(expect.objectContaining({ type: 'bb-subsgen:offscreen-cancel' }))
    expect(onBus).toContainEqual(expect.objectContaining({ videoId: 'ep335911' }))
  })

  test('still restarts when the model changed', async () => {
    // A different model is a different transcript, not the same one again.
    await startTranscription(TAB, request())
    await startTranscription(TAB, request({ model: 'belle-whisper-zh' }))

    expect(onBus).toContainEqual(expect.objectContaining({ type: 'bb-subsgen:offscreen-cancel' }))
  })
})

describe('reportAsrPlayhead', () => {
  test('passes a seek on to the run', async () => {
    await startTranscription(TAB, request())
    onBus = []

    await reportAsrPlayhead(TAB, 1920)

    expect(onBus).toEqual([
      expect.objectContaining({
        type: 'bb-subsgen:offscreen-playhead',
        target: OFFSCREEN_TARGET,
        seconds: 1920,
      }),
    ])
  })

  test('ignores a seek from a tab whose run is not the one going', async () => {
    // Otherwise scrubbing one video re-orders another video's transcription.
    await startTranscription(TAB, request())
    onBus = []

    await reportAsrPlayhead(OTHER_TAB, 1920)

    expect(onBus).toEqual([])
  })

  test('ignores a seek when nothing is being transcribed', async () => {
    await reportAsrPlayhead(TAB, 1920)

    expect(onBus).toEqual([])
  })
})

describe('routing a request for audio', () => {
  /**
   * The offscreen document cannot download Bilibili's audio itself — the CDN
   * wants a bilibili referrer and an extension page sends none — so it asks the
   * page to. The worker's only part is knowing which page.
   */
  test('asks the tab whose run is active to fetch the stream', async () => {
    await startTranscription(TAB, request())

    handleOffscreenEvent({
      type: 'bb-subsgen:offscreen-need-audio',
      videoId: 'ep335910',
      url: 'https://cdn/lo',
    })
    await settle()

    expect(toTab).toEqual([
      {
        tabId: TAB,
        message: expect.objectContaining({
          type: 'bb-subsgen:offscreen-need-audio',
          url: 'https://cdn/lo',
        }),
      },
    ])
  })

  test('ignores a request for a video that is no longer the active run', async () => {
    await startTranscription(TAB, request())

    handleOffscreenEvent({
      type: 'bb-subsgen:offscreen-need-audio',
      videoId: 'ep999999',
      url: 'https://cdn/lo',
    })
    await settle()

    expect(toTab).toEqual([])
  })

  test('claims the message, so the worker does not fall through to other handlers', () => {
    expect(
      handleOffscreenEvent({
        type: 'bb-subsgen:offscreen-need-audio',
        videoId: 'ep335910',
        url: 'https://cdn/lo',
      }),
    ).toBe(true)
  })
})

describe('routing what the offscreen document reports', () => {
  test('forwards progress to the tab that asked', async () => {
    await startTranscription(TAB, request())

    handleOffscreenEvent({
      type: 'bb-subsgen:offscreen-progress',
      videoId: 'ep335910',
      done: 0,
      total: 11,
      cues: [],
      covered: [],
    })
    await settle()

    expect(toTab).toEqual([
      {
        tabId: TAB,
        message: expect.objectContaining({
          type: 'bb-subsgen:asr-cues',
          done: 0,
          total: 11,
          complete: false,
        }),
      },
    ])
  })

  test('passes the stretches transcribed so far through to the tab', async () => {
    // What decides whether the overlay's bar is showing. The cues cannot answer
    // it: a chunk over silence is transcribed correctly and produces none.
    await startTranscription(TAB, request())

    handleOffscreenEvent({
      type: 'bb-subsgen:offscreen-progress',
      videoId: 'ep335910',
      done: 2,
      total: 11,
      cues: [],
      covered: [
        [0, 60],
        [1800, 2100],
      ],
    })
    await settle()

    expect(toTab[0].message).toMatchObject({
      covered: [
        [0, 60],
        [1800, 2100],
      ],
    })
  })

  test('drops a superseded run’s chunk, still landing', async () => {
    await startTranscription(TAB, request())

    handleOffscreenEvent({
      type: 'bb-subsgen:offscreen-progress',
      videoId: 'ep000000',
      done: 1,
      total: 11,
      cues: [],
      covered: [],
    })
    await settle()

    expect(toTab).toEqual([])
  })

  test('still knows who asked after the worker was torn down', async () => {
    // The failure this exists for. A transcription is minutes in which the
    // worker does nothing, so Chrome shuts it down as idle and it restarts to
    // receive the chunk that follows — with every variable it had reset. Only
    // what was written to session storage is still there to answer from.
    await startTranscription(TAB, request())
    // The query string makes this a distinct module id, so it is evaluated
    // afresh — a second copy of the module with none of the first's variables,
    // which is what a restarted worker is.
    // Built as an expression so TypeScript does not try to resolve the query
    // string as a path; Vite reads it at runtime and re-evaluates the module.
    const fresh = './asr-pass?worker-restarted'
    const restarted = (await import(/* @vite-ignore */ fresh)) as typeof import('./asr-pass')

    restarted.handleOffscreenEvent({
      type: 'bb-subsgen:offscreen-progress',
      videoId: 'ep335910',
      done: 3,
      total: 11,
      cues: [],
      covered: [],
    })
    await settle()

    expect(toTab).toEqual([
      {
        tabId: TAB,
        message: expect.objectContaining({ done: 3, total: 11, complete: false }),
      },
    ])
  })

  test('claims the message either way, so the worker stops looking', () => {
    // The worker has one listener for every kind of message on this bus, and a
    // false here would send an offscreen event on to handlers that cannot read it.
    expect(
      handleOffscreenEvent({
        type: 'bb-subsgen:offscreen-progress',
        videoId: 'nobody-is-waiting',
        done: 1,
        total: 2,
        cues: [],
        covered: [],
      }),
    ).toBe(true)
    expect(handleOffscreenEvent({ type: 'bb-subsgen:llm-translations' })).toBe(false)
  })
})

describe('watchAsrTab', () => {
  test('ends the run when the page holding the port goes away', async () => {
    await startTranscription(TAB, request())
    const { port, disconnect } = fakePort(TAB)
    watchAsrTab(port)

    disconnect()
    // The cancel is fire-and-forget inside the listener; let it settle.
    await settle()

    // Nothing is active any more, so a chunk arriving afterwards goes nowhere.
    handleOffscreenEvent({
      type: 'bb-subsgen:offscreen-progress',
      videoId: 'ep335910',
      done: 1,
      total: 11,
      cues: [],
      covered: [],
    })
    await settle()
    expect(toTab).toEqual([])
    expect(onBus).toContainEqual(expect.objectContaining({ type: 'bb-subsgen:offscreen-cancel' }))
  })

  test('leaves another tab’s run alone', async () => {
    await startTranscription(TAB, request())
    const { port, disconnect } = fakePort(OTHER_TAB)
    watchAsrTab(port)

    disconnect()
    await settle()

    handleOffscreenEvent({
      type: 'bb-subsgen:offscreen-progress',
      videoId: 'ep335910',
      done: 1,
      total: 11,
      cues: [],
      covered: [],
    })
    await settle()
    expect(toTab).toHaveLength(1)
  })

  // A port from the app page or the drawer rather than a content script.
  test('ignores a port with no tab behind it', () => {
    const { port, disconnect } = fakePort(undefined)

    expect(() => {
      watchAsrTab(port)
      disconnect()
    }).not.toThrow()
  })
})

/** A run that ended with one stretch missing, as the offscreen document reports it. */
async function stopWithGap() {
  await startTranscription(TAB, request())
  handleOffscreenEvent({
    type: 'bb-subsgen:offscreen-done',
    videoId: 'ep335910',
    cues: [{ start: 1, end: 3, text: '中国' }],
    done: 9,
    total: 10,
    failed: [[1800, 2100]],
    error: 'Could not reach the model server.',
  })
  await settle()
  toTab = []
  onBus = []
}

/** The instruction the offscreen document was last given. */
const transcribeRequest = () => onBus.find((msg) => msg.type === 'bb-subsgen:offscreen-transcribe')

describe('picking up where a run gave up', () => {
  test('seeds the next start with what the last run managed', async () => {
    // The point of the whole arrangement: a retry redoes one stretch, not the
    // fetch, the decode and nine chunks that were already right.
    await stopWithGap()

    await startTranscription(TAB, request())

    expect(onBus).toContainEqual(
      expect.objectContaining({
        type: 'bb-subsgen:offscreen-transcribe',
        seed: [{ start: 1, end: 3, text: '中国' }],
        only: [[1800, 2100]],
      }),
    )
  })

  test('a page reload resumes it too, not only the Retry button', async () => {
    // One path in, so reloading after a failure does not throw away work the
    // extension is still holding.
    await stopWithGap()

    await retryTranscription(TAB)

    expect(onBus).toContainEqual(expect.objectContaining({ only: [[1800, 2100]] }))
  })

  test('does not seed a different video', async () => {
    await stopWithGap()

    await startTranscription(TAB, request({ videoId: 'ep335911' }))

    expect(transcribeRequest()).toMatchObject({ videoId: 'ep335911' })
    expect(transcribeRequest()).not.toHaveProperty('seed')
    expect(transcribeRequest()).not.toHaveProperty('only')
  })

  test('does not seed a different model', async () => {
    // A different model is a different transcript; its lines are not this one's.
    await stopWithGap()

    await startTranscription(TAB, request({ model: 'belle-whisper-zh' }))

    expect(transcribeRequest()).not.toHaveProperty('seed')
  })

  test('forgets the gap once a run finishes cleanly', async () => {
    await stopWithGap()
    await startTranscription(TAB, request())
    handleOffscreenEvent({
      type: 'bb-subsgen:offscreen-done',
      videoId: 'ep335910',
      cues: [{ start: 1, end: 3, text: '中国' }],
      done: 1,
      total: 1,
      failed: [],
    })
    await settle()

    expect(await transcriptStatus(TAB)).toBeNull()
  })

  test('ignores a retry asked for by a tab that has nothing pending', async () => {
    await stopWithGap()

    await retryTranscription(OTHER_TAB)

    expect(onBus).toEqual([])
  })
})

describe('transcriptStatus', () => {
  test('reports a run in progress', async () => {
    await startTranscription(TAB, request())
    handleOffscreenEvent({
      type: 'bb-subsgen:offscreen-progress',
      videoId: 'ep335910',
      done: 3,
      total: 10,
      cues: [],
      covered: [[0, 900]],
    })
    await settle()

    expect(await transcriptStatus(TAB)).toMatchObject({ done: 3, total: 10, running: true })
  })

  test('reports what a stopped run left behind', async () => {
    await stopWithGap()

    expect(await transcriptStatus(TAB)).toMatchObject({
      done: 9,
      total: 10,
      failed: 1,
      running: false,
      error: 'Could not reach the model server.',
    })
  })

  test('has nothing to say about a tab with no run', async () => {
    expect(await transcriptStatus(OTHER_TAB)).toBeNull()
  })
})
