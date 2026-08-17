// The IndexedDB verbs every store in here needs, and nothing else.
//
// Shared rather than per-database because the awkward parts — keeping a
// transaction alive across a read, knowing when a write actually committed —
// are properties of IndexedDB itself, not of anything being stored.

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
