import { describe, expect, test } from 'vitest'
import { openFlashcardsDb, STORES } from './db'
import { done, request } from '../shared/idb'
import type { Item } from './types'

/**
 * Builds a version-1 database by hand, so the upgrade is exercised for real.
 *
 * Only the `items` store is created here. The migration touches nothing else,
 * and a fixture that recreated the whole v1 schema would have to be kept in step
 * with a shape that no longer exists anywhere in the source.
 */
function openV1(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, 1)
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORES.items, { keyPath: 'id' })
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

async function seed(name: string, items: Item[]): Promise<void> {
  const db = await openV1(name)
  const tx = db.transaction(STORES.items, 'readwrite')
  for (const row of items) tx.objectStore(STORES.items).put(row)
  await done(tx)
  db.close()
}

function read(db: IDBDatabase, id: string): Promise<Item | undefined> {
  return request(db.transaction(STORES.items).objectStore(STORES.items).get(id))
}

describe('the v2 upgrade', () => {
  test('releases the words that were waiting in the intake pool', async () => {
    const name = `migrate-${Math.random()}`
    await seed(name, [item({ id: 'w:憔悴', kind: 'word', text: '憔悴', state: 'pool' })])

    const db = await openFlashcardsDb(name)
    expect((await read(db, 'w:憔悴'))?.state).toBe('new')
  })

  test('leaves the lines in the pool, because they are still rationed', async () => {
    const name = `migrate-${Math.random()}`
    await seed(name, [item({ id: 's:他很憔悴。', kind: 'sentence', text: '他很憔悴。', state: 'pool' })])

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
    await seed(name, [original])

    const db = await openFlashcardsDb(name)
    expect(await read(db, 'w:憔悴')).toEqual({ ...original, state: 'new' })
  })

  test('leaves words that were already in the deck exactly where they were', async () => {
    const name = `migrate-${Math.random()}`
    await seed(name, [
      item({ id: 'w:学习', kind: 'word', text: '学习', state: 'review', interval: 7, introducedAt: 1 }),
      item({ id: 'w:我', kind: 'word', text: '我', state: 'known' }),
      item({ id: 'w:新', kind: 'word', text: '新', state: 'new' }),
    ])

    const db = await openFlashcardsDb(name)
    expect((await read(db, 'w:学习'))?.state).toBe('review')
    expect((await read(db, 'w:学习'))?.interval).toBe(7)
    expect((await read(db, 'w:我'))?.state).toBe('known')
    expect((await read(db, 'w:新'))?.state).toBe('new')
  })

  test('a fresh database opens at v2 with every store in place', async () => {
    // The upgrade branches on oldVersion, so the create path has to keep working
    // for anyone installing the extension for the first time.
    const db = await openFlashcardsDb(`fresh-${Math.random()}`)
    for (const store of Object.values(STORES)) {
      expect(db.objectStoreNames.contains(store)).toBe(true)
    }
    expect(db.version).toBe(2)
  })
})
