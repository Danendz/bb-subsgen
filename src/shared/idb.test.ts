import { describe, expect, test } from 'vitest'
import { connection } from './idb'

let n = 0

/** A one-store database per test, so nothing here shares state with anything else. */
function open(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, 1)
    req.onupgradeneeded = () => req.result.createObjectStore('rows')
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function fresh(): { name: string; connect: () => Promise<IDBDatabase>; opens: () => number } {
  const name = `idb-test-${n++}`
  let opens = 0
  const connect = connection(() => {
    opens++
    return open(name)
  })
  return { name, connect, opens: () => opens }
}

describe('connection', () => {
  test('opens once and hands the same connection back', async () => {
    const { connect, opens } = fresh()
    expect(await connect()).toBe(await connect())
    expect(opens()).toBe(1)
  })

  test('hands back a connection you can actually use after the last one closed', async () => {
    // The wizard's bug: a dictionary import occupies the extension page long
    // enough for the idle worker to start tearing down, and the memoized
    // connection is dead by the time the next lookup arrives.
    const { connect } = fresh()
    const dead = await connect()
    dead.close()

    const db = await connect()
    expect(() => db.transaction('rows', 'readonly')).not.toThrow()
  })

  test('does not reopen a healthy connection just because someone asked twice', async () => {
    const { connect, opens } = fresh()
    await connect()
    await connect()
    await connect()
    expect(opens()).toBe(1)
  })

  test('never caches a failed open, so one bad moment is not permanent', async () => {
    let fail = true
    const connect = connection(() => {
      if (fail) return Promise.reject(new Error('nope'))
      return open(`idb-test-${n++}`)
    })

    await expect(connect()).rejects.toThrow('nope')
    fail = false
    await expect(connect()).resolves.toBeTruthy()
  })

  test('gets out of the way of an upgrade started somewhere else', async () => {
    // Without `onversionchange` the memoized connection holds the old version
    // open and the other context's upgrade blocks forever — the study app
    // opening a bumped schema while the worker is mid-lookup.
    const { name, connect } = fresh()
    const held = await connect()

    const upgraded = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(name, 2)
      req.onupgradeneeded = () => req.result.createObjectStore('more')
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
      req.onblocked = () => reject(new Error('blocked by the memoized connection'))
    })
    expect(upgraded.version).toBe(2)
    // Closed rather than merely forgotten, which is what unblocked the upgrade.
    expect(() => held.transaction('rows', 'readonly')).toThrow()
  })
})
