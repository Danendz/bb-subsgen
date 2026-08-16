import { describe, expect, test } from 'vitest'
import { openFlashcardsDb, STORES } from './db'
import { done, request } from '../shared/idb'
import type { Item } from './types'

/**
 * Builds an old database by hand, so the upgrades are exercised for real.
 *
 * Creates only the stores the migrations actually touch: `items` for v2, plus
 * the three that carry a `bvid` for v3, under their original key paths. A
 * fixture that recreated the whole v1 schema would have to be kept in step with
 * a shape that no longer exists anywhere in the source.
 */
function openOld(name: string, version = 1): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, version)
    req.onupgradeneeded = () => {
      const db = req.result
      db.createObjectStore(STORES.items, { keyPath: 'id' })
      const videoWords = db.createObjectStore(STORES.videoWords, {
        keyPath: ['bvid', 'headword'],
      })
      videoWords.createIndex('by-video', 'bvid')
      db.createObjectStore(STORES.videos, { keyPath: 'bvid' })
      db.createObjectStore(STORES.signals, { keyPath: 'seq', autoIncrement: true })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function item(partial: Partial<Item> & Pick<Item, 'id' | 'kind' | 'text' | 'state'>): Item {
  return {
    interval: 0,
    ease: 2.5,
    due: 0,
    reps: 0,
    lapses: 0,
    createdAt: 0,
    contexts: [],
    ...partial,
  }
}

interface Seed {
  items?: Item[]
  videoWords?: Array<Record<string, unknown>>
  videos?: Array<Record<string, unknown>>
  signals?: Array<Record<string, unknown>>
}

async function seed(name: string, rows: Seed, version = 1): Promise<void> {
  const db = await openOld(name, version)
  const names = Object.keys(rows) as Array<keyof Seed>
  if (names.length) {
    const tx = db.transaction(
      names.map((key) => STORES[key]),
      'readwrite',
    )
    for (const key of names) {
      for (const row of rows[key]!) tx.objectStore(STORES[key]).put(row)
    }
    await done(tx)
  }
  db.close()
}

function read(db: IDBDatabase, id: string): Promise<Item | undefined> {
  return request(db.transaction(STORES.items).objectStore(STORES.items).get(id))
}

function readAll<T>(db: IDBDatabase, store: string): Promise<T[]> {
  return request<T[]>(db.transaction(store).objectStore(store).getAll())
}

describe('the v2 upgrade', () => {
  test('releases the words that were waiting in the intake pool', async () => {
    const name = `migrate-${Math.random()}`
    await seed(name, { items: [item({ id: 'w:憔悴', kind: 'word', text: '憔悴', state: 'pool' })] })

    const db = await openFlashcardsDb(name)
    expect((await read(db, 'w:憔悴'))?.state).toBe('new')
  })

  test('leaves the lines in the pool, because they are still rationed', async () => {
    const name = `migrate-${Math.random()}`
    await seed(name, {
      items: [item({ id: 's:他很憔悴。', kind: 'sentence', text: '他很憔悴。', state: 'pool' })],
    })

    const db = await openFlashcardsDb(name)
    expect((await read(db, 's:他很憔悴。'))?.state).toBe('pool')
  })

  test('changes nothing but the state, so no history is lost', async () => {
    // This database holds study history that cannot be rebuilt from anything.
    // A migration here edits one field and leaves every other byte alone.
    const name = `migrate-${Math.random()}`
    const original = item({
      id: 'w:憔悴',
      kind: 'word',
      text: '憔悴',
      state: 'pool',
      reps: 3,
      lapses: 1,
      createdAt: 1700000000000,
      contexts: [{ text: '他很憔悴。', translation: 'He looks haggard.', at: 1700000000000 }],
    })
    await seed(name, { items: [original] })

    const db = await openFlashcardsDb(name)
    expect(await read(db, 'w:憔悴')).toEqual({ ...original, state: 'new' })
  })

  test('leaves words that were already in the deck exactly where they were', async () => {
    const name = `migrate-${Math.random()}`
    await seed(name, {
      items: [
        item({ id: 'w:学习', kind: 'word', text: '学习', state: 'review', interval: 7, introducedAt: 1 }),
        item({ id: 'w:我', kind: 'word', text: '我', state: 'known' }),
        item({ id: 'w:新', kind: 'word', text: '新', state: 'new' }),
      ],
    })

    const db = await openFlashcardsDb(name)
    expect((await read(db, 'w:学习'))?.state).toBe('review')
    expect((await read(db, 'w:学习'))?.interval).toBe(7)
    expect((await read(db, 'w:我'))?.state).toBe('known')
    expect((await read(db, 'w:新'))?.state).toBe('new')
  })
})

describe('the v3 upgrade', () => {
  test('moves per-video words onto the new key, keeping their counts', async () => {
    const name = `migrate-${Math.random()}`
    await seed(
      name,
      { videoWords: [{ bvid: 'BV1xx411c7mD', headword: '憔悴', count: 4 }] },
      2,
    )

    const db = await openFlashcardsDb(name)
    expect(await readAll(db, STORES.videoWords)).toEqual([
      { videoId: 'BV1xx411c7mD', headword: '憔悴', count: 4 },
    ])
  })

  test('the by-video index still answers, now under the new name', async () => {
    // The index is what `videoWords()` queries; recreating the store without it
    // would leave every per-video lookup returning nothing.
    const name = `migrate-${Math.random()}`
    await seed(
      name,
      {
        videoWords: [
          { bvid: 'BV1xx411c7mD', headword: '憔悴', count: 4 },
          { bvid: 'BV1xx411c7mD', headword: '学习', count: 2 },
          { bvid: 'BV2yy411c7mD', headword: '学习', count: 9 },
        ],
      },
      2,
    )

    const db = await openFlashcardsDb(name)
    const index = db
      .transaction(STORES.videoWords)
      .objectStore(STORES.videoWords)
      .index('by-video')
    const rows = await request<Array<{ headword: string }>>(
      index.getAll(IDBKeyRange.only('BV1xx411c7mD')),
    )
    expect(rows.map((row) => row.headword).sort()).toEqual(['学习', '憔悴'])
  })

  test('moves watched videos across without losing their history', async () => {
    const name = `migrate-${Math.random()}`
    const video = {
      bvid: 'BV1xx411c7mD',
      title: '航拍中国',
      url: 'https://www.bilibili.com/video/BV1xx411c7mD',
      firstWatched: 1700000000000,
      lastWatched: 1700000900000,
      lines: 312,
    }
    await seed(name, { videos: [video] }, 2)

    const db = await openFlashcardsDb(name)
    const { bvid, ...rest } = video
    expect(await readAll(db, STORES.videos)).toEqual([{ ...rest, videoId: bvid }])
  })

  test('renames the field inside every context a card carries', async () => {
    const name = `migrate-${Math.random()}`
    await seed(
      name,
      {
        items: [
          item({
            id: 'w:憔悴',
            kind: 'word',
            text: '憔悴',
            state: 'review',
            // Written as it was stored before the rename, which is the whole
            // point of the fixture — hence the cast past the current type.
            contexts: [
              {
                text: '他很憔悴。',
                translation: 'He looks haggard.',
                at: 1700000000000,
                start: 42.5,
                bvid: 'BV1xx411c7mD',
              },
            ] as unknown as Item['contexts'],
          }),
        ],
      },
      2,
    )

    const db = await openFlashcardsDb(name)
    const contexts = (await read(db, 'w:憔悴'))!.contexts
    expect(contexts[0].videoId).toBe('BV1xx411c7mD')
    expect('bvid' in contexts[0]).toBe(false)
    // The rest of the context is what the card renders; none of it may move.
    expect(contexts[0].text).toBe('他很憔悴。')
    expect(contexts[0].translation).toBe('He looks haggard.')
    expect(contexts[0].start).toBe(42.5)
  })

  test('leaves a reader context alone, because it never had the field', async () => {
    const name = `migrate-${Math.random()}`
    const original = item({
      id: 's:他很憔悴。',
      kind: 'sentence',
      text: '他很憔悴。',
      state: 'review',
      contexts: [
        {
          text: '他很憔悴。',
          translation: 'He looks haggard.',
          at: 1700000000000,
          url: 'https://zhihu.com/question/1',
        },
      ],
    })
    await seed(name, { items: [original] }, 2)

    const db = await openFlashcardsDb(name)
    expect(await read(db, 's:他很憔悴。')).toEqual(original)
  })

  test('renames the field on dwell samples', async () => {
    const name = `migrate-${Math.random()}`
    await seed(
      name,
      { signals: [{ at: 1700000000000, bvid: 'BV1xx411c7mD', start: 42.5, ms: 6200, hidden: true, captured: true }] },
      2,
    )

    const db = await openFlashcardsDb(name)
    const [signal] = await readAll<Record<string, unknown>>(db, STORES.signals)
    expect(signal.videoId).toBe('BV1xx411c7mD')
    expect('bvid' in signal).toBe(false)
    expect(signal.ms).toBe(6200)
  })

  test('carries review history through untouched', async () => {
    // The whole reason this migration copies rather than drops: the deck cannot
    // be rebuilt from anything, so a version bump must not cost a single review.
    const name = `migrate-${Math.random()}`
    const original = item({
      id: 'w:学习',
      kind: 'word',
      text: '学习',
      state: 'review',
      interval: 21,
      level: 4,
      reps: 9,
      lapses: 2,
      introducedAt: 1690000000000,
      createdAt: 1690000000000,
      due: 1710000000000,
    })
    await seed(name, { items: [original] }, 2)

    const db = await openFlashcardsDb(name)
    expect(await read(db, 'w:学习')).toEqual(original)
  })

  test('upgrades all the way from v1, running both migrations in order', async () => {
    const name = `migrate-${Math.random()}`
    await seed(name, {
      items: [item({ id: 'w:憔悴', kind: 'word', text: '憔悴', state: 'pool' })],
      videoWords: [{ bvid: 'BV1xx411c7mD', headword: '憔悴', count: 4 }],
    })

    const db = await openFlashcardsDb(name)
    expect((await read(db, 'w:憔悴'))?.state).toBe('new')
    expect(await readAll(db, STORES.videoWords)).toEqual([
      { videoId: 'BV1xx411c7mD', headword: '憔悴', count: 4 },
    ])
  })

  test('a fresh database opens at v3 with every store in place', async () => {
    // The upgrade branches on oldVersion, so the create path has to keep working
    // for anyone installing the extension for the first time.
    const db = await openFlashcardsDb(`fresh-${Math.random()}`)
    for (const store of Object.values(STORES)) {
      expect(db.objectStoreNames.contains(store)).toBe(true)
    }
    expect(db.version).toBe(3)
  })

  test('a fresh database keys on videoId, not bvid', async () => {
    const db = await openFlashcardsDb(`fresh-${Math.random()}`)
    const tx = db.transaction([STORES.videoWords, STORES.videos])
    expect(tx.objectStore(STORES.videoWords).keyPath).toEqual(['videoId', 'headword'])
    expect(tx.objectStore(STORES.videos).keyPath).toBe('videoId')
    expect(tx.objectStore(STORES.videoWords).index('by-video').keyPath).toBe('videoId')
  })
})
