// The chat database.
//
// Its own database rather than a store inside `bb-subsgen-flashcards`, for two
// reasons. The study database holds history that cannot be reconstructed, and
// adding to it means a migration on the one thing there is no way to re-derive.
// And conversations have no sensible merge semantics — two browsers editing the
// same chat is undefined — so they would have to be special-cased through
// `backup.ts`'s replay anyway.
//
// The cost of that choice, stated plainly: conversations do not travel with an
// export. They are notes about your study, not the study itself.
//
// Opened directly by the study app and by the drawer iframe, both of which run
// on the extension origin.

import { connection } from '../shared/idb'

const DB_NAME = 'bb-subsgen-chat'
const VERSION = 1

export const STORES = {
  chats: 'chats',
  messages: 'messages',
} as const

/** `dbName` is overridable so tests don't share state. */
export function openChatDb(dbName = DB_NAME): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName, VERSION)

    req.onupgradeneeded = () => {
      const db = req.result

      const chats = db.createObjectStore(STORES.chats, { keyPath: 'id' })
      // The history list is ordered by last activity, not by creation: a
      // conversation you came back to yesterday belongs at the top.
      chats.createIndex('by-updated', 'updatedAt')
      // "Have I already asked about this card?" — answered without a scan.
      chats.createIndex('by-item', 'itemId')

      const messages = db.createObjectStore(STORES.messages, {
        keyPath: 'seq',
        autoIncrement: true,
      })
      messages.createIndex('by-chat', 'chatId')
    }

    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export const chatDb = connection(() => openChatDb())
