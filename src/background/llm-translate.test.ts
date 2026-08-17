import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

// The pass talks to four things. Three of them are stubbed so what is under
// test is the orchestration itself — the order work is done in, what is retried,
// what is cached and what is sent back.
vi.mock('./defs-store', () => ({ lookupDefs: vi.fn(async () => ({})) }))
vi.mock('../llm/log', () => ({ log: () => {} }))
vi.mock('./llm-cache', () => ({
  readTrack: vi.fn(async () => new Map<number, string>()),
  writeLines: vi.fn(async () => {}),
  evict: vi.fn(async () => 0),
}))

import {
  cancelPass,
  cancelPassIfNavigatedAway,
  passStatus,
  reportPlayhead,
  setChatBusy,
  startPass,
  watchTabLiveness,
  type PassCue,
} from './llm-translate'
import { readTrack, writeLines } from './llm-cache'

const TAB = 7

interface Sent {
  system: string
  user: string
  ids: number[]
}

let sent: Sent[]
let posted: Array<{ start: number; text: string }>
/** Ids the fake model will refuse to return, by how many times it has been asked. */
let skip: (ids: number[], call: number) => number[]

function cues(count: number): PassCue[] {
  return Array.from({ length: count }, (_, i) => ({
    start: i * 2,
    text: `第${i}句`,
    words: [`第${i}句`],
  }))
}

/** Reads the ids out of a user turn, which is `${id}\t${zh}` per line. */
function idsIn(user: string): number[] {
  return [...user.matchAll(/^(\d+)\t/gm)].map((m) => Number(m[1]))
}

function request(over: Partial<Parameters<typeof startPass>[0]> = {}) {
  return {
    tabId: TAB,
    videoId: 'BV1',
    lang: 'en' as const,
    model: 'gemma',
    baseUrl: 'http://localhost:1234/v1',
    cues: cues(4),
    ...over,
  }
}

beforeEach(() => {
  sent = []
  posted = []
  skip = () => []
  setChatBusy(false)
  vi.mocked(readTrack).mockResolvedValue(new Map())
  vi.mocked(writeLines).mockClear()

  globalThis.chrome = {
    tabs: {
      sendMessage: async (_tabId: number, msg: { lines: Array<{ start: number; text: string }> }) => {
        posted.push(...msg.lines)
      },
    },
  } as unknown as typeof chrome

  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body))
    const system = body.messages[0].content as string
    const user = body.messages[1].content as string
    const ids = idsIn(user)
    sent.push({ system, user, ids })

    const withheld = new Set(skip(ids, sent.length))
    const lines = ids
      .filter((id) => !withheld.has(id))
      .map((id) => ({ id, zh: `第${id}句`, en: `line ${id}` }))

    return new Response(
      JSON.stringify({ choices: [{ message: { content: JSON.stringify({ lines }) } }] }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )
  }) as typeof fetch
})

afterEach(() => {
  cancelPass()
})

describe('a duplicate request', () => {
  /** Holds the model's reply open, so a pass can be caught mid-batch. */
  function hangingFetch() {
    let release: () => void = () => {}
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    const original = globalThis.fetch
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      await held
      return original(url, init)
    }) as typeof fetch
    return release
  }

  test('leaves a pass for the same track alone', async () => {
    // Bilibili replaces the <video> element during DASH and DRM setup, which
    // remounts the overlay and re-sends this. Starting over would abandon the
    // batch in flight for nothing.
    const release = hangingFetch()
    const first = startPass(request())
    await Promise.resolve()

    await startPass(request())
    release()
    await first

    expect(sent.filter((s) => s.ids[0] === 0)).toHaveLength(1)
  })

  test('restarts when the track has grown', async () => {
    // A transcribed video: chunks land and the cue list gets longer. The same
    // video with more lines in it is more work to do, not the same work again.
    const release = hangingFetch()
    const first = startPass(request({ cues: cues(2) }))
    await Promise.resolve()

    release()
    await startPass(request({ cues: cues(4) }))
    await first.catch(() => {})

    expect(posted.map((line) => line.start)).toContain(6)
  })
})

describe('startPass', () => {
  test('translates the whole track and reports it back', async () => {
    await startPass(request())

    // Addressed by cue start, not by position: the content script's copy of the
    // track can grow underneath a running pass.
    expect(posted).toEqual([
      { start: 0, text: 'line 0' },
      { start: 2, text: 'line 1' },
      { start: 4, text: 'line 2' },
      { start: 6, text: 'line 3' },
    ])
  })

  test('caches what it produced, keyed by cue start', async () => {
    await startPass(request({ cues: cues(2) }))

    expect(vi.mocked(writeLines).mock.calls[0][1]).toEqual([
      { start: 0, text: 'line 0' },
      { start: 2, text: 'line 1' },
    ])
  })

  // A second viewing must cost nothing.
  test('reports cached lines without asking for them again', async () => {
    vi.mocked(readTrack).mockResolvedValue(new Map([[0, 'cached 0'], [2, 'cached 1']]))

    await startPass(request({ cues: cues(2) }))

    expect(posted).toEqual([
      { start: 0, text: 'cached 0' },
      { start: 2, text: 'cached 1' },
    ])
    expect(sent).toHaveLength(0)
  })

  test('leaves blank cues out of the request entirely', async () => {
    const track = cues(3)
    track[1] = { start: 2, text: '   ', words: [] }

    await startPass(request({ cues: track }))

    expect(sent[0].ids).toEqual([0, 2])
  })

  test('carries the video subject in the system prompt', async () => {
    await startPass(request({ video: { title: '家常菜', description: '做饭教程' } }))

    expect(sent[0].system).toContain('家常菜')
    expect(sent[0].system).toContain('做饭教程')
  })

  describe('when the model drops lines', () => {
    test('retries exactly the ones that went missing', async () => {
      skip = (ids, call) => (call === 1 ? [ids[1]] : [])

      await startPass(request({ cues: cues(3) }))

      expect(sent).toHaveLength(2)
      expect(sent[1].ids).toEqual([1])
      expect(posted.map((l) => l.start).sort((a, b) => a - b)).toEqual([0, 2, 4])
    })

    // Twice asked, twice ignored: the on-device translation is already on
    // screen for that line, and a third ask spends the GPU on the least
    // valuable line in the video.
    test('gives up after one retry rather than chasing a line forever', async () => {
      skip = (ids) => ids.filter((id) => id === 1)

      await startPass(request({ cues: cues(3) }))

      expect(sent).toHaveLength(2)
      expect(posted.map((l) => l.start)).toEqual([0, 4])
    })

    test('a batch that comes back empty does not stop the pass', async () => {
      skip = (ids, call) => (call <= 2 ? ids : [])

      await startPass(request({ cues: cues(50) }))

      // The first batch and its retry produced nothing; the second batch still ran.
      expect(posted.length).toBeGreaterThan(0)
    })
  })

  // What the popup's progress bar reads. The popup is short-lived and the pass
  // is not, so it asks rather than listens — a popup opened mid-pass has to be
  // able to fill its bar immediately.
  describe('passStatus', () => {
    test('is null when nothing is running', () => {
      expect(passStatus(TAB)).toBeNull()
    })

    test('is null for a tab whose pass is not the active one', async () => {
      const seen: Array<ReturnType<typeof passStatus>> = []
      const inner = globalThis.fetch
      globalThis.fetch = ((url: string, init: RequestInit) => {
        seen.push(passStatus(TAB + 1))
        return inner(url, init)
      }) as typeof fetch

      await startPass(request({ cues: cues(4) }))

      expect(seen).not.toHaveLength(0)
      expect(seen.every((s) => s === null)).toBe(true)
    })

    test('counts only the lines that were ever going to be translated', async () => {
      const track = cues(4)
      track[1].text = '   '
      let total: number | undefined
      const inner = globalThis.fetch
      globalThis.fetch = ((url: string, init: RequestInit) => {
        total ??= passStatus(TAB)?.total
        return inner(url, init)
      }) as typeof fetch

      await startPass(request({ cues: track }))

      expect(total).toBe(3)
    })

    test('climbs as batches land, and carries the video and model', async () => {
      const seen: number[] = []
      const inner = globalThis.fetch
      globalThis.fetch = ((url: string, init: RequestInit) => {
        const status = passStatus(TAB)!
        seen.push(status.translated)
        expect(status).toMatchObject({ videoId: 'BV1', model: 'gemma', total: 60 })
        return inner(url, init)
      }) as typeof fetch

      await startPass(request({ cues: cues(60) }))

      // Read before each batch is sent: nothing, then 25, then 50.
      expect(seen).toEqual([0, 25, 50])
    })

    // A re-watch should show a full bar at once rather than climbing from zero.
    test('counts cached lines before anything is asked for', async () => {
      vi.mocked(readTrack).mockResolvedValue(new Map([[0, 'cached 0'], [2, 'cached 2']]))
      let first: number | undefined
      const inner = globalThis.fetch
      globalThis.fetch = ((url: string, init: RequestInit) => {
        first ??= passStatus(TAB)?.translated
        return inner(url, init)
      }) as typeof fetch

      await startPass(request({ cues: cues(4) }))

      expect(first).toBe(2)
    })

    test('is null again once the pass has finished', async () => {
      await startPass(request({ cues: cues(4) }))

      expect(passStatus(TAB)).toBeNull()
    })
  })

  /**
   * The backstop for a tab that navigates without closing.
   *
   * `tabs.onRemoved` covers a closed tab and the content script covers SPA
   * navigation, but neither covers typing a new address or following a link off
   * the site: the content script is destroyed without getting to say so, and
   * the tab still exists. Only the worker can notice, and until it did the pass
   * kept translating a video nobody had open.
   */
  describe('cancelPassIfNavigatedAway', () => {
    /** Runs `act` while the first batch is in flight, then lets the pass finish. */
    async function midPass(cueCount: number, act: () => void) {
      let acted = false
      const inner = globalThis.fetch
      globalThis.fetch = ((url: string, init: RequestInit) => {
        if (!acted) {
          acted = true
          act()
        }
        return inner(url, init)
      }) as typeof fetch
      await startPass(request({ cues: cues(cueCount) }))
    }

    test('cancels when the tab has left the video behind', async () => {
      await midPass(75, () => cancelPassIfNavigatedAway(TAB, 'https://www.bilibili.com/'))

      expect(passStatus(TAB)).toBeNull()
      expect(sent).toHaveLength(1)
    })

    test('cancels when the tab has moved to a different video', async () => {
      await midPass(75, () =>
        cancelPassIfNavigatedAway(TAB, 'https://www.bilibili.com/video/BV2/'),
      )

      expect(sent).toHaveLength(1)
    })

    test('leaves a pass alone when the tab is still on its video', async () => {
      await midPass(75, () =>
        cancelPassIfNavigatedAway(TAB, 'https://www.bilibili.com/video/BV1?t=90'),
      )

      // The whole track, not just the batch that was in flight.
      expect(sent).toHaveLength(3)
    })

    test('ignores a navigation in some other tab', async () => {
      await midPass(75, () => cancelPassIfNavigatedAway(TAB + 1, 'https://example.com/'))

      expect(sent).toHaveLength(3)
    })

    test('is harmless when no pass is running', () => {
      expect(() => cancelPassIfNavigatedAway(TAB, 'https://example.com/')).not.toThrow()
    })
  })

  /**
   * The catch-all for a content script that dies without warning.
   *
   * `cancelPassIfNavigatedAway` only sees a URL the extension has permission
   * for, which is Bilibili and nothing else — so leaving the site entirely, the
   * most ordinary way to "change the page", is invisible to it. A port has no
   * such condition: whatever kills the page kills the port with it.
   */
  describe('watchTabLiveness', () => {
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

    test('cancels the pass when the page holding the port goes away', async () => {
      const { port, disconnect } = fakePort(TAB)
      const inner = globalThis.fetch
      let done = false
      globalThis.fetch = ((url: string, init: RequestInit) => {
        if (!done) {
          done = true
          watchTabLiveness(port)
          disconnect()
        }
        return inner(url, init)
      }) as typeof fetch

      await startPass(request({ cues: cues(75) }))

      expect(passStatus(TAB)).toBeNull()
      expect(sent).toHaveLength(1)
    })

    test('leaves other tabs’ passes alone', async () => {
      const { port, disconnect } = fakePort(TAB + 1)
      const inner = globalThis.fetch
      let done = false
      globalThis.fetch = ((url: string, init: RequestInit) => {
        if (!done) {
          done = true
          watchTabLiveness(port)
          disconnect()
        }
        return inner(url, init)
      }) as typeof fetch

      await startPass(request({ cues: cues(75) }))

      expect(sent).toHaveLength(3)
    })

    // A port from the app page or the drawer rather than a content script.
    test('ignores a port with no tab behind it', () => {
      const { port, disconnect } = fakePort(undefined)

      expect(() => {
        watchTabLiveness(port)
        disconnect()
      }).not.toThrow()
    })
  })

  describe('ordering', () => {
    test('starts at the top of the track', async () => {
      await startPass(request({ cues: cues(60) }))

      expect(sent[0].ids[0]).toBe(0)
    })

    // Seeking should not make you wait for everything you skipped: the batch
    // under the playhead goes first, and only then does it come back for the
    // stretch that was jumped over.
    test('goes to the playhead first, then back for what was skipped', async () => {
      const started = startPass(request({ cues: cues(75) }))
      reportPlayhead(TAB, 50)
      await started

      expect(sent.map((batch) => batch.ids[0])).toEqual([50, 0, 25])
    })

    test('ignores a playhead reported for a different tab', async () => {
      const started = startPass(request({ cues: cues(75) }))
      reportPlayhead(TAB + 1, 50)
      await started

      expect(sent.map((batch) => batch.ids[0])).toEqual([0, 25, 50])
    })
  })

  describe('the seam between batches', () => {
    test('carries the previous batch’s last lines and their translations', async () => {
      await startPass(request({ cues: cues(30) }))

      expect(sent[1].user).toContain('第24句 → line 24')
      expect(sent[1].user).toContain('do not return them')
    })

    // Nothing precedes the first batch, and after a seek nothing precedes the
    // batch at the playhead either.
    test('is absent when nothing translated comes before the batch', async () => {
      await startPass(request({ cues: cues(10) }))

      expect(sent[0].user).not.toContain('Already translated')
    })
  })

  describe('sharing the GPU', () => {
    test('waits while a chat is generating', async () => {
      setChatBusy(true)
      const started = startPass(request({ cues: cues(2) }))

      await new Promise((r) => setTimeout(r, 50))
      expect(sent).toHaveLength(0)

      setChatBusy(false)
      await started
      expect(sent).toHaveLength(1)
    })
  })

  describe('cancelling', () => {
    test('stops the pass and posts nothing more', async () => {
      const started = startPass(request({ cues: cues(100) }))
      cancelPass(TAB)
      await started

      expect(posted).toHaveLength(0)
    })

    test('leaves a pass belonging to another tab alone', async () => {
      const started = startPass(request({ cues: cues(4) }))
      cancelPass(TAB + 1)
      await started

      expect(posted).toHaveLength(4)
    })

    test('starting a new pass supersedes the one running', async () => {
      const first = startPass(request({ videoId: 'BV1', cues: cues(100) }))
      await startPass(request({ videoId: 'BV2', cues: cues(2) }))
      await first

      expect(posted.every((line) => line.text.startsWith('line'))).toBe(true)
    })
  })
})
