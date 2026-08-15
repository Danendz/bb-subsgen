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

import { cancelPass, reportPlayhead, setChatBusy, startPass, type PassCue } from './llm-translate'
import { readTrack, writeLines } from './llm-cache'

const TAB = 7

interface Sent {
  system: string
  user: string
  ids: number[]
}

let sent: Sent[]
let posted: Array<{ index: number; text: string }>
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
    bvid: 'BV1',
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
      sendMessage: async (_tabId: number, msg: { lines: Array<{ index: number; text: string }> }) => {
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

describe('startPass', () => {
  test('translates the whole track and reports it back', async () => {
    await startPass(request())

    expect(posted).toEqual([
      { index: 0, text: 'line 0' },
      { index: 1, text: 'line 1' },
      { index: 2, text: 'line 2' },
      { index: 3, text: 'line 3' },
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
      { index: 0, text: 'cached 0' },
      { index: 1, text: 'cached 1' },
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
      expect(posted.map((l) => l.index).sort()).toEqual([0, 1, 2])
    })

    // Twice asked, twice ignored: the on-device translation is already on
    // screen for that line, and a third ask spends the GPU on the least
    // valuable line in the video.
    test('gives up after one retry rather than chasing a line forever', async () => {
      skip = (ids) => ids.filter((id) => id === 1)

      await startPass(request({ cues: cues(3) }))

      expect(sent).toHaveLength(2)
      expect(posted.map((l) => l.index)).toEqual([0, 2])
    })

    test('a batch that comes back empty does not stop the pass', async () => {
      skip = (ids, call) => (call <= 2 ? ids : [])

      await startPass(request({ cues: cues(50) }))

      // The first batch and its retry produced nothing; the second batch still ran.
      expect(posted.length).toBeGreaterThan(0)
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
      const first = startPass(request({ bvid: 'BV1', cues: cues(100) }))
      await startPass(request({ bvid: 'BV2', cues: cues(2) }))
      await first

      expect(posted.every((line) => line.text.startsWith('line'))).toBe(true)
    })
  })
})
