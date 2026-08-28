// The IndexedDB verbs every store in here needs, plus the connection itself.
//
// Shared rather than per-database because the awkward parts — keeping a
// transaction alive across a read, knowing when a write actually committed,
// noticing that a connection has died under you — are properties of IndexedDB
// itself, not of anything being stored. All four databases had their own
// identical copy of the memo in `connection` below, and all four had the same
// bug in it.

/**
 * Whether a connection can still start a transaction.
 *
 * A connection in the "closing" state looks entirely healthy — it is not null,
 * nothing has rejected, `db.name` still answers — right up until
 * `db.transaction()` throws `InvalidStateError` synchronously. So the only
 * honest test is to try it: open a throwaway readonly transaction over the
 * first store and abort it before it can do anything.
 *
 * A database with no stores at all has nothing to probe against and is reported
 * usable; the caller's own transaction would fail on the missing store either
 * way, and that is a different bug from this one.
 */
function usable(db: IDBDatabase): boolean {
  const store = db.objectStoreNames[0]
  if (!store) return true
  try {
    const tx = db.transaction(store, 'readonly')
    // The abort is the point — nothing is read. Handled so the event has a
    // listener rather than surfacing as an unhandled transaction abort.
    tx.onabort = () => {}
    tx.abort()
    return true
  } catch (e) {
    if (e instanceof DOMException && e.name === 'InvalidStateError') return false
    throw e
  }
}

/**
 * Memoizes an open, and gives up the memo when the connection stops working.
 *
 * The memo is what every caller wants: the service worker is torn down whenever
 * it goes idle and woken by the next lookup, so an open should resolve once per
 * worker lifetime rather than once per read.
 *
 * What the four hand-rolled copies of it got wrong is the other half. They
 * cleared the memo when the *open* rejected and never again, so a connection
 * that opened fine and later died was handed out forever. That is the setup
 * wizard's failure: a dictionary import occupies the extension page for tens of
 * seconds, the idle worker begins teardown and its connections enter the
 * "closing" state, and the wizard's `bb-subsgen:dict-changed` then revives that
 * same JS context — where the memo still holds the dead connection and the
 * first `db.transaction(...)` throws.
 *
 * Three guards, in the order they fire:
 *
 * - `onversionchange` — another context wants to upgrade. Close and forget, or
 *   the upgrade blocks on us indefinitely.
 * - `onclose` — the connection died abnormally. Forget it so the next call
 *   reopens.
 * - the `usable` probe — because `onclose` is *not* guaranteed to fire during
 *   worker teardown, which is exactly the scenario above. The handlers are the
 *   fast path; the probe is the guard that actually holds.
 *
 * A failed probe reopens once and hands back whatever that produces, so a
 * genuinely broken database surfaces its error to the caller instead of
 * reopening in a loop.
 */
export function connection(open: () => Promise<IDBDatabase>): () => Promise<IDBDatabase> {
  let ready: Promise<IDBDatabase> | null = null

  const forget = (attempt: Promise<IDBDatabase>) => {
    // Compared by identity: a later open may already have replaced this one,
    // and a dying connection must not evict its own successor.
    if (ready === attempt) ready = null
  }

  const start = (): Promise<IDBDatabase> => {
    const attempt: Promise<IDBDatabase> = open().then(
      (db) => {
        db.onversionchange = () => {
          db.close()
          forget(attempt)
        }
        db.onclose = () => forget(attempt)
        return db
      },
      (e: unknown) => {
        // Don't cache a failed open, or one transient error poisons the context
        // until the browser restarts.
        forget(attempt)
        throw e
      },
    )
    return attempt
  }

  return async () => {
    const attempt = ready ?? (ready = start())
    const db = await attempt
    if (usable(db)) return db

    forget(attempt)
    return (ready = start())
  }
}

/** Promise-wraps a request. */
export function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

/**
 * Read-modify-write within a live transaction.
 *
 * The `put` is issued synchronously inside the `get`'s success handler, which
 * is the only reliable way to keep an IndexedDB transaction alive across a
 * read. Awaiting the read first — or chaining off a promise — hands control
 * back to the microtask queue, and the transaction may auto-commit before the
 * write is ever issued.
 */
export function upsert<T>(
  store: IDBObjectStore,
  key: IDBValidKey,
  update: (existing: T | undefined) => T,
): void {
  const req = store.get(key)
  req.onsuccess = () => store.put(update(req.result as T | undefined))
}

/** Resolves when the transaction commits, so callers can fire several writes then await once. */
export function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}
