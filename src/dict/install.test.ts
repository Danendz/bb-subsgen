import { describe, expect, test } from 'vitest'
import { installDictionary } from './install'
import { getLexiconIn, getMetaIn, lookupDefsIn, openDictDb } from './store'
import type { DictSource } from './sources'

const source: DictSource = {
  lang: 'zh',
  langName: 'Chinese',
  name: 'Test dictionary',
  url: 'https://example.test/dict.gz',
  licence: 'CC BY-SA 4.0',
  attribution: 'Test',
}

/** A real gzip stream, so the installer's DecompressionStream does real work. */
function gzipFetchOf(text: string): typeof fetch {
  return (async () => {
    const body = new Response(text).body!.pipeThrough(new CompressionStream('gzip'))
    return { ok: true, status: 200, body, headers: new Headers() } as unknown as Response
  }) as typeof fetch
}

const TWO_WORDS = [
  '喜歡 喜欢 [xi3 huan5] /to like/to be fond of/',
  '你好 你好 [ni3 hao3] /hello/',
].join('\n')
const ONE_WORD = '喜歡 喜欢 [xi3 huan5] /to like/to be fond of/'

describe('installDictionary', () => {
  test('a good install writes meta last, and the store is readable afterwards', async () => {
    const db = await openDictDb(`test-${Math.random()}`)
    const meta = await installDictionary({ source, db, fetch: gzipFetchOf(TWO_WORDS) })

    expect(meta.entryCount).toBe(2)
    expect(await getMetaIn(db, 'zh')).toEqual(meta)
    expect(await getLexiconIn(db, 'zh')).toContain('喜欢\txi3 huan5')
    expect(await lookupDefsIn(db, 'zh', ['喜欢'])).toEqual({
      喜欢: [
        {
          simplified: '喜欢',
          traditional: '喜歡',
          pinyin: 'xi3 huan5',
          definitions: ['to like', 'to be fond of'],
        },
      ],
    })
  })

  test('an interrupted download leaves the dictionary unreadable as installed', async () => {
    const db = await openDictDb(`test-${Math.random()}`)
    const brokenFetch: typeof fetch = (async () =>
      ({
        ok: true,
        status: 200,
        body: new ReadableStream<Uint8Array>({
          start(controller) {
            controller.error(new Error('network dropped'))
          },
        }),
        headers: new Headers(),
      }) as unknown as Response) as typeof fetch

    await expect(installDictionary({ source, db, fetch: brokenFetch })).rejects.toThrow()
    expect(await getMetaIn(db, 'zh')).toBeNull()
  })

  test('re-installing a shrunk dictionary removes the headwords that went away', async () => {
    const db = await openDictDb(`test-${Math.random()}`)
    await installDictionary({ source, db, fetch: gzipFetchOf(TWO_WORDS) })
    expect((await lookupDefsIn(db, 'zh', ['你好'])).你好).toHaveLength(1)

    await installDictionary({ source, db, fetch: gzipFetchOf(ONE_WORD) })
    expect(await lookupDefsIn(db, 'zh', ['你好'])).toEqual({ 你好: [] })
    expect(await lookupDefsIn(db, 'zh', ['喜欢'])).toEqual({
      喜欢: [
        {
          simplified: '喜欢',
          traditional: '喜歡',
          pinyin: 'xi3 huan5',
          definitions: ['to like', 'to be fond of'],
        },
      ],
    })
  })
})
