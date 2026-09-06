import { describe, expect, test } from 'vitest'
import { openFlashcardsDb, STORES } from './db'
import { done, request } from '../shared/idb'
import { namespaceLegacyId, type Item } from './types'

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
    req.onupgradeneeded = (event) => {
      const db = req.result
      if (event.oldVersion < 1) {
        db.createObjectStore(STORES.items, { keyPath: 'id' })
        const videoWords = db.createObjectStore(STORES.videoWords, {
          keyPath: ['bvid', 'headword'],
        })
        videoWords.createIndex('by-video', 'bvid')
        db.createObjectStore(STORES.videos, { keyPath: 'bvid' })
        db.createObjectStore(STORES.signals, { keyPath: 'seq', autoIncrement: true })
        // The v4 transform touches these three as well, and a fixture opened at
        // v3 has to have them for the same reason it has the others: the
        // migration reads every store it rewrites.
        const reviews = db.createObjectStore(STORES.reviews, {
          keyPath: 'seq',
          autoIncrement: true,
        })
        reviews.createIndex('by-item', 'itemId')
        reviews.createIndex('by-at', 'at')
        db.createObjectStore(STORES.exposures, { keyPath: 'headword' })
        const ranks = db.createObjectStore(STORES.ranks, { keyPath: 'headword' })
        ranks.createIndex('by-rank', 'rank')
      }
      // A fixture seeded at v3 is describing a database the v3 migration has
      // already run on, so the two stores that migration rekeys are created in
      // their post-v3 shape rather than migrated into it.
      if (event.oldVersion < 3 && version >= 3) {
        db.deleteObjectStore(STORES.videoWords)
        const videoWords = db.createObjectStore(STORES.videoWords, {
          keyPath: ['videoId', 'headword'],
        })
        videoWords.createIndex('by-video', 'videoId')
        db.deleteObjectStore(STORES.videos)
        db.createObjectStore(STORES.videos, { keyPath: 'videoId' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function item(partial: Partial<Item> & Pick<Item, 'id' | 'kind' | 'text' | 'state'>): Item {
  return {
    // Every fixture below is a row written before schema 4, so none of them
    // carries one — the field is filled in by the migration under test.
    lang: undefined as unknown as string,
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
  reviews?: Array<Record<string, unknown>>
  exposures?: Array<Record<string, unknown>>
  ranks?: Array<Record<string, unknown>>
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

/**
 * Reads a card by the id it has *now*.
 *
 * Opening the fixture runs every migration it is behind, so a row seeded as
 * `w:憔悴` comes back out of the v4 transform as `w:zh:憔悴`. Tests below name
 * the old id, which is what they are about, and this is where it is lifted.
 */
function read(db: IDBDatabase, id: string): Promise<Item | undefined> {
  const store = db.transaction(STORES.items).objectStore(STORES.items)
  return request(store.get(namespaceLegacyId('zh', id)))
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
    expect(await read(db, 'w:憔悴')).toEqual({
      ...original,
      state: 'new',
      lang: 'zh',
      id: 'w:zh:憔悴',
      // Every later migration runs too, so the v5 tag is here as well. Named
      // rather than loosened: the point of this case is that nothing changes
      // except what a migration was asked to change.
      contexts: [{ ...original.contexts[0], translationLang: 'en' }],
    })
  })

  test('leaves words that were already in the deck exactly where they were', async () => {
    const name = `migrate-${Math.random()}`
    await seed(name, {
      items: [
        item({
          id: 'w:学习',
          kind: 'word',
          text: '学习',
          state: 'review',
          interval: 7,
          introducedAt: 1,
        }),
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
    await seed(name, { videoWords: [{ bvid: 'BV1xx411c7mD', headword: '憔悴', count: 4 }] }, 2)

    const db = await openFlashcardsDb(name)
    expect(await readAll(db, STORES.videoWords)).toEqual([
      { videoId: 'BV1xx411c7mD', lang: 'zh', headword: '憔悴', count: 4 },
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
    const index = db.transaction(STORES.videoWords).objectStore(STORES.videoWords).index('by-video')
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
    expect(await read(db, 's:他很憔悴。')).toEqual({
      ...original,
      lang: 'zh',
      id: 's:zh:他很憔悴。',
      contexts: [{ ...original.contexts[0], translationLang: 'en' }],
    })
  })

  test('renames the field on dwell samples', async () => {
    const name = `migrate-${Math.random()}`
    await seed(
      name,
      {
        signals: [
          {
            at: 1700000000000,
            bvid: 'BV1xx411c7mD',
            start: 42.5,
            ms: 6200,
            hidden: true,
            captured: true,
          },
        ],
      },
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
    expect(await read(db, 'w:学习')).toEqual({ ...original, lang: 'zh', id: 'w:zh:学习' })
  })
})

describe('the v4 upgrade', () => {
  const seedV3 = (name: string, rows: Seed) => seed(name, rows, 3)

  test('gives every card an id that says which language it is in', async () => {
    const name = `migrate-${Math.random()}`
    await seedV3(name, {
      items: [
        item({ id: 'w:生', kind: 'word', text: '生', state: 'new' }),
        item({ id: 's:他很憔悴。', kind: 'sentence', text: '他很憔悴。', state: 'pool' }),
        item({
          id: 'g:de-complement',
          kind: 'grammar',
          text: 'V + 得 + how',
          state: 'pool',
          patternId: 'de-complement',
        }),
      ],
    })

    const db = await openFlashcardsDb(name)
    const ids = (await readAll<Item>(db, STORES.items)).map((row) => row.id).sort()
    expect(ids).toEqual(['g:zh:de-complement', 's:zh:他很憔悴。', 'w:zh:生'].sort())
  })

  test('says the language on the card too, not only in the key', async () => {
    // Query paths read the field; nothing anywhere parses an id.
    const name = `migrate-${Math.random()}`
    await seedV3(name, { items: [item({ id: 'w:生', kind: 'word', text: '生', state: 'new' })] })

    const db = await openFlashcardsDb(name)
    expect((await read(db, 'w:生'))?.lang).toBe('zh')
  })

  test('reviews still resolve to their card, so no history is orphaned', async () => {
    // The thing this migration must not break. `replay` finds a card's reviews
    // by `itemId`, so a log left pointing at `w:学习` after the card became
    // `w:zh:学习` is a card whose entire schedule has silently gone.
    const name = `migrate-${Math.random()}`
    await seedV3(name, {
      items: [item({ id: 'w:学习', kind: 'word', text: '学习', state: 'review', interval: 21 })],
      reviews: [
        { itemId: 'w:学习', at: 1700000000000, grade: 'good', style: 'recognise' },
        { itemId: 'w:学习', at: 1700086400000, grade: 'again', style: 'type' },
      ],
    })

    const db = await openFlashcardsDb(name)
    const card = (await read(db, 'w:学习'))!
    const reviews = await readAll<{ itemId: string; at: number }>(db, STORES.reviews)
    expect(reviews).toHaveLength(2)
    expect(reviews.every((row) => row.itemId === card.id)).toBe(true)
  })

  test('the review log keeps its own keys, so nothing is reordered or duplicated', async () => {
    // `seq` is an autoIncrement key and `by-at` is what the streak walks. A
    // repoint is a value edit; moving the rows would be a different migration.
    const name = `migrate-${Math.random()}`
    await seedV3(name, {
      reviews: [
        { itemId: 'w:学习', at: 3, grade: 'good', style: 'recognise' },
        { itemId: 'w:我', at: 1, grade: 'good', style: 'recognise' },
      ],
    })

    const db = await openFlashcardsDb(name)
    const rows = await readAll<{ seq: number; at: number }>(db, STORES.reviews)
    expect(rows.map((row) => row.seq)).toEqual([1, 2])
    expect(rows.map((row) => row.at)).toEqual([3, 1])
  })

  test('exposure counts survive the move to a composite key', async () => {
    const name = `migrate-${Math.random()}`
    await seedV3(name, {
      exposures: [{ headword: '生', count: 42, firstSeen: 1, lastSeen: 2 }],
    })

    const db = await openFlashcardsDb(name)
    expect(await readAll(db, STORES.exposures)).toEqual([
      { lang: 'zh', headword: '生', count: 42, firstSeen: 1, lastSeen: 2 },
    ])
  })

  test('the by-video index still answers after videoWords is recreated', async () => {
    // Recreating a store drops its indexes with it, and `videoWords()` queries
    // nothing else — so losing this one makes every per-video lookup empty.
    const name = `migrate-${Math.random()}`
    await seedV3(name, {
      videoWords: [
        { videoId: 'BV1xx411c7mD', headword: '憔悴', count: 4 },
        { videoId: 'BV1xx411c7mD', headword: '学习', count: 2 },
        { videoId: 'BV2yy411c7mD', headword: '学习', count: 9 },
      ],
    })

    const db = await openFlashcardsDb(name)
    const index = db.transaction(STORES.videoWords).objectStore(STORES.videoWords).index('by-video')
    const rows = await request<Array<{ headword: string; lang: string }>>(
      index.getAll(IDBKeyRange.only('BV1xx411c7mD')),
    )
    expect(rows.map((row) => row.headword).sort()).toEqual(['学习', '憔悴'])
    expect(rows.every((row) => row.lang === 'zh')).toBe(true)
  })

  test('a hand-imported word list keeps both its rank and its HSK level', async () => {
    // The two lists share a row and neither may disturb the other — which is
    // still true across a rekey, or an upgrade silently costs you one of them.
    const name = `migrate-${Math.random()}`
    await seedV3(name, { ranks: [{ headword: '学习', rank: 412, hsk: 2 }] })

    const db = await openFlashcardsDb(name)
    expect(await readAll(db, STORES.ranks)).toEqual([
      { lang: 'zh', headword: '学习', rank: 412, hsk: 2 },
    ])
  })

  test('a sentence at the length cap survives whole, segment and all', async () => {
    // Ids gained a segment, and `MAX_SENTENCE_LENGTH` caps the text at 220. A
    // key is not truncated by anything, and this says so rather than assuming it.
    const name = `migrate-${Math.random()}`
    const line = '好'.repeat(220)
    await seedV3(name, {
      items: [item({ id: `s:${line}`, kind: 'sentence', text: line, state: 'pool' })],
    })

    const db = await openFlashcardsDb(name)
    expect((await read(db, `s:${line}`))?.text).toBe(line)
  })

  test('upgrades all the way from v1, running every migration in order', async () => {
    const name = `migrate-${Math.random()}`
    await seed(name, {
      items: [item({ id: 'w:憔悴', kind: 'word', text: '憔悴', state: 'pool' })],
      videoWords: [{ bvid: 'BV1xx411c7mD', headword: '憔悴', count: 4 }],
    })

    const db = await openFlashcardsDb(name)
    const card = (await read(db, 'w:憔悴'))!
    expect(card.state).toBe('new')
    expect(card.id).toBe('w:zh:憔悴')
    expect(await readAll(db, STORES.videoWords)).toEqual([
      { videoId: 'BV1xx411c7mD', lang: 'zh', headword: '憔悴', count: 4 },
    ])
  })

  test('a fresh database keys the three headword stores by language', async () => {
    const db = await openFlashcardsDb(`fresh-${Math.random()}`)
    const tx = db.transaction([STORES.exposures, STORES.videoWords, STORES.ranks])
    expect(tx.objectStore(STORES.exposures).keyPath).toEqual(['lang', 'headword'])
    expect(tx.objectStore(STORES.videoWords).keyPath).toEqual(['videoId', 'lang', 'headword'])
    expect(tx.objectStore(STORES.ranks).keyPath).toEqual(['lang', 'headword'])
    expect(tx.objectStore(STORES.ranks).index('by-rank').keyPath).toBe('rank')
  })
})

describe('the v5 upgrade', () => {
  const context = (text: string, translation: string) => ({
    text,
    translation,
    videoId: 'BV1',
    at: 1700000000000,
  })

  test('tags every stored translation with the language it is in', async () => {
    const name = `v5-${Math.random()}`
    await seed(name, {
      items: [
        item({
          id: 'w:憔悴',
          kind: 'word',
          text: '憔悴',
          state: 'learning',
          contexts: [context('他很憔悴', 'He looks worn out')],
        }),
      ],
    })

    const db = await openFlashcardsDb(name, 'ru')

    expect((await read(db, 'w:憔悴'))!.contexts[0].translationLang).toBe('ru')
  })

  // Only `en` and `ru` have ever shipped, so whichever is set now is the one
  // every existing card was captured under — but nothing may be *invented* for
  // a context that never had a translation to begin with.
  test('leaves a context that never had a translation untagged', async () => {
    const name = `v5-${Math.random()}`
    await seed(name, {
      items: [
        item({
          id: 'w:生',
          kind: 'word',
          text: '生',
          state: 'learning',
          contexts: [context('他还活着', '')],
        }),
      ],
    })

    const db = await openFlashcardsDb(name, 'en')

    expect((await read(db, 'w:生'))!.contexts[0].translationLang).toBeUndefined()
  })

  test('tags some contexts of a card without disturbing the others', async () => {
    const name = `v5-${Math.random()}`
    await seed(name, {
      items: [
        item({
          id: 'w:好',
          kind: 'word',
          text: '好',
          state: 'learning',
          contexts: [context('很好', 'Very good'), context('好吗', '')],
        }),
      ],
    })

    const db = await openFlashcardsDb(name, 'en')
    const contexts = (await read(db, 'w:好'))!.contexts

    expect(contexts).toHaveLength(2)
    expect(contexts[0].translationLang).toBe('en')
    expect(contexts[1].translationLang).toBeUndefined()
    expect(contexts[1].text).toBe('好吗')
  })

  // This database cannot be rebuilt from anything (see the note at the top of
  // db.ts), so a version bump must not cost a single review or a single card.
  test('costs no card, no review and no context', async () => {
    const name = `v5-${Math.random()}`
    await seed(name, {
      items: [
        item({
          id: 'w:憔悴',
          kind: 'word',
          text: '憔悴',
          state: 'learning',
          reps: 3,
          lapses: 1,
          contexts: [context('他很憔悴', 'He looks worn out'), context('憔悴不堪', 'Utterly worn')],
        }),
        item({ id: 'w:生', kind: 'word', text: '生', state: 'known' }),
      ],
      reviews: [{ itemId: 'w:憔悴', at: 1, grade: 3 }],
    })

    const db = await openFlashcardsDb(name, 'en')
    const card = (await read(db, 'w:憔悴'))!

    expect(await readAll(db, STORES.items)).toHaveLength(2)
    expect(await readAll(db, STORES.reviews)).toHaveLength(1)
    expect(card.contexts).toHaveLength(2)
    expect(card.reps).toBe(3)
    expect(card.lapses).toBe(1)
    expect(card.contexts.map((c) => c.text)).toEqual(['他很憔悴', '憔悴不堪'])
  })

  // The steps run one after another, so a database that is four versions behind
  // has to come out the far end with both the v4 keys and the v5 tag.
  test('a v1 database arrives with its language namespace and its tag alike', async () => {
    const name = `v5-${Math.random()}`
    await seed(name, {
      items: [
        item({
          id: 'w:憔悴',
          kind: 'word',
          text: '憔悴',
          state: 'learning',
          contexts: [{ text: '他很憔悴', translation: 'Worn out', bvid: 'BV1' }] as never,
        }),
      ],
    })

    const db = await openFlashcardsDb(name, 'ru')
    const card = (await read(db, 'w:憔悴'))!

    expect(card.lang).toBe('zh')
    expect(card.contexts[0].videoId).toBe('BV1')
    expect(card.contexts[0].translationLang).toBe('ru')
  })

  test('a card already tagged is left as it was', async () => {
    const name = `v5-${Math.random()}`
    await seed(
      name,
      {
        items: [
          item({
            // Seeded at v4, so it carries the id and the `lang` that migration
            // already gave it — only the v5 step is under test here.
            id: 'w:zh:生',
            kind: 'word',
            text: '生',
            state: 'learning',
            lang: 'zh',
            contexts: [{ ...context('他还活着', 'Está vivo'), translationLang: 'es' }],
          }),
        ],
      },
      4,
    )

    const db = await openFlashcardsDb(name, 'en')

    expect((await read(db, 'w:生'))!.contexts[0].translationLang).toBe('es')
  })
})

describe('a fresh database', () => {
  test('a fresh database opens at the current version with every store in place', async () => {
    // The upgrade branches on oldVersion, so the create path has to keep working
    // for anyone installing the extension for the first time.
    const db = await openFlashcardsDb(`fresh-${Math.random()}`)
    for (const store of Object.values(STORES)) {
      expect(db.objectStoreNames.contains(store)).toBe(true)
    }
    expect(db.version).toBe(5)
  })

  test('a fresh database keys on videoId, not bvid', async () => {
    const db = await openFlashcardsDb(`fresh-${Math.random()}`)
    const tx = db.transaction([STORES.videoWords, STORES.videos])
    expect(tx.objectStore(STORES.videoWords).keyPath).toEqual(['videoId', 'lang', 'headword'])
    expect(tx.objectStore(STORES.videos).keyPath).toBe('videoId')
    expect(tx.objectStore(STORES.videoWords).index('by-video').keyPath).toBe('videoId')
  })
})
