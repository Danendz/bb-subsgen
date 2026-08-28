// The deck as it stood just before a schema migration ran.
//
// `bb-subsgen-flashcards` is the one database the architecture rules call
// irreplaceable, and schema 4 rewrites every key in it. A migration that either
// completes or rolls back is the strongest guarantee IndexedDB offers, and it is
// not a guarantee about the *shape* being right — a transform with a bug commits
// just as cleanly as one without. So the old rows are copied out first, and the
// recovery story is the Import button that already exists.
//
// Its own database, not another store in the deck: an IDB transaction is scoped
// to one database, so a versionchange transaction on the deck physically cannot
// write anywhere else. The snapshot has to happen on an earlier, separate open —
// which is what `snapshotIfOutdated` is.
//
// What is stored is the serialised string rather than a structured clone of the
// rows. The stored bytes are then exactly the bytes the Download button hands
// over, immune to any later change in the `Backup` types — a snapshot that
// needed the current code to read it would be worth nothing in the case it
// exists for.

import { connection, done, request } from '../shared/idb'
import { BACKUP_VERSION, type Backup } from './backup'

const DB_NAME = 'bb-subsgen-flashcards-snapshots'

/** 1 — the original schema. */
const VERSION = 1

const STORE = 'snapshots'

export interface Snapshot {
  /**
   * Schema version of the deck this was taken from — the key.
   *
   * One row per version bump rather than one per run, so re-opening the deck
   * cannot pile up copies, and so a row says for itself what it is a snapshot
   * *of*. Nothing is ever overwritten in practice: once the deck is at v4 the
   * probe never fires for v3 again.
   */
  fromVersion: number
  at: number
  /** Exactly what Download would have written for that deck. */
  json: string
}

/** `dbName` is overridable so tests don't share state. */
export function openSnapshotsDb(dbName = DB_NAME): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName, VERSION)
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE, { keyPath: 'fromVersion' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

/** Memoized like the other four — see `connection` in shared/idb.ts. */
export const snapshotsDb = connection(() => openSnapshotsDb())

export async function putSnapshotIn(db: IDBDatabase, snapshot: Snapshot): Promise<void> {
  const tx = db.transaction(STORE, 'readwrite')
  tx.objectStore(STORE).put(snapshot)
  await done(tx)
}

/** Newest first, which is the order the Data tab offers them in. */
export async function listSnapshotsIn(db: IDBDatabase): Promise<Snapshot[]> {
  const rows = await request<Snapshot[]>(
    db.transaction(STORE, 'readonly').objectStore(STORE).getAll(),
  )
  return rows.sort((a, b) => b.fromVersion - a.fromVersion)
}

export async function listSnapshots(): Promise<Snapshot[]> {
  return listSnapshotsIn(await snapshotsDb())
}

/** The rows a backup is made of, however the deck happens to be keyed. */
export type DeckRows = Pick<Backup, 'items' | 'reviews' | 'exposures' | 'videoWords' | 'videos'>

/**
 * Which backup format describes the rows of a given deck schema.
 *
 * Backup 3 is the namespaced one, and schema 4 is what namespaced the database —
 * so anything read out below that is a version 2 file, and `upgrade()` is what
 * lifts it on the way back in. A future schema bump that changes the exported
 * shape adds a line here; one that does not, does not.
 */
function backupVersionFor(schema: number): number {
  return schema < 4 ? 2 : BACKUP_VERSION
}

/**
 * Copies the deck out if it is about to be migrated, and does nothing otherwise.
 *
 * `indexedDB.databases()` rather than a bare `indexedDB.open(name)` to find out
 * whether there is anything to snapshot. This is a Chromium-only extension so it
 * is available, and a bare open on a fresh profile would *create* an empty v1
 * database — which the `oldVersion >= 1` branch in db.ts would then read as an
 * existing deck and try to migrate.
 *
 * `readRows` is injected rather than imported so this module does not depend on
 * db.ts, which depends on this one.
 *
 * A failure here is warned about and swallowed. The snapshot is insurance; a
 * deck that refuses to open because its insurance could not be written is a
 * worse outcome than the migration it was insuring against.
 */
export async function snapshotIfOutdated(
  deckName: string,
  target: number,
  readRows: (db: IDBDatabase) => Promise<DeckRows>,
  snapshots: () => Promise<IDBDatabase> = snapshotsDb,
): Promise<void> {
  try {
    const found = (await indexedDB.databases()).find((entry) => entry.name === deckName)
    if (found?.version === undefined || found.version >= target) return

    const old = await openAt(deckName, found.version)
    try {
      const backup: Backup = {
        version: backupVersionFor(found.version),
        exportedAt: Date.now(),
        ...(await readRows(old)),
      }
      await putSnapshotIn(await snapshots(), {
        fromVersion: found.version,
        at: Date.now(),
        json: JSON.stringify(backup),
      })
    } finally {
      // Closed before the caller opens at the new version, or the upgrade blocks
      // on this connection until the tab goes away.
      old.close()
    }
  } catch (e) {
    console.warn('[bb-subsgen] could not snapshot the deck before upgrading', e)
  }
}

/** Opens at the version already on disk, so no upgrade transaction can fire. */
function openAt(name: string, version: number): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, version)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}
