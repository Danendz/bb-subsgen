import { beforeEach, describe, expect, test } from 'vitest'
import { installWordList } from './wordlist-install'
import { wordListMeta } from '../background/flashcards-store'
import { listRanks } from './queries'
import { flashcardsDb } from './db'
import type { WordListSource } from './wordlist-sources'

const source: WordListSource = {
  id: 'hsk30',
  lang: 'zh',
  kind: 'hsk',
  name: 'Test list',
  label: 'HSK 3.0 levels',
  blurb: 'Test',
  url: 'https://example.test/list.json',
  licence: 'MIT',
  attribution: 'Test',
}

/** `WordListMeta` lives in extension storage, which the node suite has none of. */
function stubStorage() {
  let held: Record<string, unknown> = {}
  globalThis.chrome = {
    storage: {
      local: {
        get: (key: string) => Promise.resolve({ [key]: held[key] }),
        set: (patch: Record<string, unknown>) => {
          held = { ...held, ...patch }
          return Promise.resolve()
        },
      },
    },
  } as unknown as typeof chrome
}

/** Plain text over a real stream, so the byte counter and decoder do real work. */
function fetchOf(text: string, contentLength?: number): typeof fetch {
  return (async () =>
    ({
      ok: true,
      status: 200,
      body: new Response(text).body,
      headers: new Headers(
        contentLength === undefined ? {} : { 'content-length': String(contentLength) },
      ),
    }) as unknown as Response) as typeof fetch
}

const PAYLOAD = JSON.stringify([
  { s: '的', q: 1, l: ['n1'] },
  { s: '呵护', q: 13381, l: ['n7'] },
])

describe('installWordList', () => {
  beforeEach(stubStorage)

  test('files the list under the source it came from, so a later update knows what it replaced', async () => {
    const meta = await installWordList({ source, fetch: fetchOf(PAYLOAD) })

    expect(meta.sourceId).toBe('hsk30')
    // The pinned commit, not `main` — a list that changes underneath an
    // installed deck re-ranks every card with nothing to compare against.
    expect(meta.ref).toMatch(/^[0-9a-f]{40}$/)
    expect(meta.count).toBe(2)
    expect(await wordListMeta('zh')).toMatchObject({ hsk: { sourceId: 'hsk30' } })

    const ranks = await listRanks(await flashcardsDb(), 'zh')
    expect(ranks.find((rank) => rank.headword === '呵护')?.hsk).toBe(7)
  })

  test('reports bytes as they arrive, because a 3MB download is not instant', async () => {
    const seen: Array<{ loaded: number; total: number | null }> = []
    await installWordList({
      source,
      fetch: fetchOf(PAYLOAD, 999),
      onProgress: (progress) => seen.push(progress),
    })

    expect(seen.length).toBeGreaterThan(0)
    expect(seen.at(-1)?.total).toBe(999)
    expect(seen.at(-1)?.loaded).toBe(new TextEncoder().encode(PAYLOAD).byteLength)
  })

  test('refuses a payload that parsed to nothing, rather than wiping the list you had', async () => {
    // An empty write would go through `replaceWordList` and clear the language
    // — a silent downgrade from "your list" to "no list" on a bad response.
    await expect(installWordList({ source, fetch: fetchOf('[]') })).rejects.toThrow(/no words/)
  })

  test('says which list failed, since two kinds install from the same URL', async () => {
    const failing = (async () =>
      ({ ok: false, status: 404, body: null }) as unknown as Response) as typeof fetch

    await expect(installWordList({ source, fetch: failing })).rejects.toThrow(/Test list.*404/)
  })
})
