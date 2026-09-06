import { describe, expect, test } from 'vitest'
import { openSnapshotsDb, listSnapshotsIn, snapshotIfOutdated, type DeckRows } from './snapshot'
import { openFlashcardsDb, readAllRows, STORES } from './db'
import { done, request } from '../shared/idb'
import { isBackup, upgrade, type Backup } from './backup'
import type { Item } from './types'

/** A v3 deck, built by hand — the shape the schema-4 migration reads. */
function openV3(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, 3)
    req.onupgradeneeded = () => {
      const db = req.result
      db.createObjectStore(STORES.items, { keyPath: 'id' })
      const reviews = db.createObjectStore(STORES.reviews, { keyPath: 'seq', autoIncrement: true })
      reviews.createIndex('by-at', 'at')
      db.createObjectStore(STORES.exposures, { keyPath: 'headword' })
      const videoWords = db.createObjectStore(STORES.videoWords, {
        keyPath: ['videoId', 'headword'],
      })
      videoWords.createIndex('by-video', 'videoId')
      db.createObjectStore(STORES.videos, { keyPath: 'videoId' })
      db.createObjectStore(STORES.signals, { keyPath: 'seq', autoIncrement: true })
      db.createObjectStore(STORES.ranks, { keyPath: 'headword' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

const card = (id: string, text: string): Item =>
  ({
    id,
    kind: 'word',
    text,
    state: 'review',
    interval: 21,
    level: 5,
    ease: 2.5,
    due: 1710000000000,
    reps: 9,
    lapses: 1,
    createdAt: 1690000000000,
    introducedAt: 1690000000000,
    contexts: [],
    // Written before schema 4, so it has no language yet — that is the point.
  }) as unknown as Item

async function seedV3(name: string): Promise<void> {
  const db = await openV3(name)
  const tx = db.transaction([STORES.items, STORES.reviews, STORES.exposures], 'readwrite')
  tx.objectStore(STORES.items).put(card('w:学习', '学习'))
  tx.objectStore(STORES.reviews).put({
    itemId: 'w:学习',
    at: 1700000000000,
    grade: 'good',
    style: 'recognise',
    intervalBefore: 14,
    intervalAfter: 21,
  })
  tx.objectStore(STORES.exposures).put({ headword: '学习', count: 12, firstSeen: 1, lastSeen: 2 })
  await done(tx)
  db.close()
}

/** A snapshots database of its own per test, so nothing shares state. */
function snapshotsIn(name: string) {
  let db: Promise<IDBDatabase> | null = null
  return () => (db ??= openSnapshotsDb(name))
}

describe('snapshotIfOutdated', () => {
  test('copies the deck out before the migration that rewrites it runs', async () => {
    // The whole point: the copy has to be taken while the old keys are still
    // the keys. Once `openFlashcardsDb` has been through, there is nothing left
    // to compare an upgraded deck against.
    const name = `snap-${Math.random()}`
    await seedV3(name)
    const snapshots = snapshotsIn(`store-${Math.random()}`)

    await snapshotIfOutdated(name, 4, readAllRows, snapshots)

    const [saved] = await listSnapshotsIn(await snapshots())
    const parsed = JSON.parse(saved.json) as Backup
    expect(saved.fromVersion).toBe(3)
    expect(parsed.items[0].id).toBe('w:学习')
    expect(parsed.reviews[0].itemId).toBe('w:学习')
  })

  test('labels it as the backup format those rows are actually in', async () => {
    // A pre-schema-4 deck is a version 2 file, and saying so is what makes
    // `upgrade()` lift it on the way back in.
    const name = `snap-${Math.random()}`
    await seedV3(name)
    const snapshots = snapshotsIn(`store-${Math.random()}`)

    await snapshotIfOutdated(name, 4, readAllRows, snapshots)

    const [saved] = await listSnapshotsIn(await snapshots())
    expect((JSON.parse(saved.json) as Backup).version).toBe(2)
  })

  test('what it wrote is a backup the Import button can read', async () => {
    // The recovery story is "hand this file to Import". A snapshot that needed
    // anything else to read it would be worth nothing in the case it exists for.
    const name = `snap-${Math.random()}`
    await seedV3(name)
    const snapshots = snapshotsIn(`store-${Math.random()}`)

    await snapshotIfOutdated(name, 4, readAllRows, snapshots)

    const [saved] = await listSnapshotsIn(await snapshots())
    const parsed: unknown = JSON.parse(saved.json)
    expect(isBackup(parsed)).toBe(true)

    const lifted = upgrade(parsed as Backup)
    // Lands on exactly the ids the migration produced, so re-importing merges
    // onto the migrated cards instead of doubling the deck beside them.
    expect(lifted.items[0].id).toBe('w:zh:学习')
    expect(lifted.reviews[0].itemId).toBe('w:zh:学习')
    expect(lifted.exposures[0].lang).toBe('zh')
  })

  test('drops the review log keys, which mean nothing in another database', async () => {
    const name = `snap-${Math.random()}`
    await seedV3(name)
    const snapshots = snapshotsIn(`store-${Math.random()}`)

    await snapshotIfOutdated(name, 4, readAllRows, snapshots)

    const [saved] = await listSnapshotsIn(await snapshots())
    expect('seq' in (JSON.parse(saved.json) as Backup).reviews[0]).toBe(false)
  })

  test('leaves the deck closed, so the upgrade behind it is not blocked', async () => {
    // A connection still open at the old version blocks the versionchange
    // transaction until the tab goes away — which looks like the app hanging.
    const name = `snap-${Math.random()}`
    await seedV3(name)
    const snapshots = snapshotsIn(`store-${Math.random()}`)

    await snapshotIfOutdated(name, 4, readAllRows, snapshots)
    const db = await openFlashcardsDb(name)

    expect(db.version).toBe(5)
    expect(await readAllRows(db)).toMatchObject({ items: [{ id: 'w:zh:学习' }] })
  })

  test('does nothing at all on a profile with no deck yet', async () => {
    // `indexedDB.databases()` rather than a bare open, precisely so a fresh
    // install does not get an empty v1 database created for it here — which the
    // `oldVersion >= 1` branch would then try to migrate.
    const name = `snap-${Math.random()}`
    const snapshots = snapshotsIn(`store-${Math.random()}`)

    await snapshotIfOutdated(name, 4, readAllRows, snapshots)

    expect(await listSnapshotsIn(await snapshots())).toEqual([])
    expect((await indexedDB.databases()).some((entry) => entry.name === name)).toBe(false)
  })

  test('does nothing when the deck is already current', async () => {
    const name = `snap-${Math.random()}`
    ;(await openFlashcardsDb(name)).close()
    const snapshots = snapshotsIn(`store-${Math.random()}`)

    await snapshotIfOutdated(name, 4, readAllRows, snapshots)

    expect(await listSnapshotsIn(await snapshots())).toEqual([])
  })

  test('is keyed by version, so opening the deck twice cannot pile up copies', async () => {
    const name = `snap-${Math.random()}`
    await seedV3(name)
    const snapshots = snapshotsIn(`store-${Math.random()}`)

    await snapshotIfOutdated(name, 4, readAllRows, snapshots)
    await snapshotIfOutdated(name, 4, readAllRows, snapshots)

    expect(await listSnapshotsIn(await snapshots())).toHaveLength(1)
  })

  test('a failure to snapshot does not stop the deck opening', async () => {
    // The snapshot is insurance. A deck that refuses to open because its
    // insurance could not be written is worse than the risk it was insuring.
    const name = `snap-${Math.random()}`
    await seedV3(name)
    const snapshots = snapshotsIn(`store-${Math.random()}`)
    const explode = (): Promise<DeckRows> => Promise.reject(new Error('read failed'))

    await expect(snapshotIfOutdated(name, 4, explode, snapshots)).resolves.toBeUndefined()
    expect(await listSnapshotsIn(await snapshots())).toEqual([])
  })
})

describe('the snapshots database', () => {
  test('holds the serialised string, not a clone of the rows', async () => {
    // Stored bytes are then exactly the bytes Download hands over, immune to any
    // later change in the `Backup` types.
    const name = `snap-${Math.random()}`
    await seedV3(name)
    const snapshots = snapshotsIn(`store-${Math.random()}`)

    await snapshotIfOutdated(name, 4, readAllRows, snapshots)

    const db = await snapshots()
    const [row] = await request<Array<{ json: unknown }>>(
      db.transaction('snapshots').objectStore('snapshots').getAll(),
    )
    expect(typeof row.json).toBe('string')
  })
})
