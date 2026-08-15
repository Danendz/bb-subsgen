// Reading and writing conversations.
//
// Every function has an `…In(db, …)` form taking an explicit database, with a
// thin wrapper over the memoized handle beside it — the same split as
// `flashcards-store.ts`, and for the same reason: it is what makes the logic
// testable without a live extension around it.

import { done, request } from '../shared/idb'
import { chatDb, STORES } from './db'
import type { Chat, ChatContext, ChatMessage } from './types'

/** How much of the opening message becomes the conversation's name. */
const TITLE_LIMIT = 60

/**
 * A conversation's name, taken from what it opened with.
 *
 * Deliberately not asked for: naming a chat before having it is a chore, and
 * the first thing said is almost always a better label than anything typed into
 * a prompt box would be.
 */
export function titleFrom(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  if (!flat) return 'New chat'
  return flat.length <= TITLE_LIMIT ? flat : `${flat.slice(0, TITLE_LIMIT).trimEnd()}…`
}

export interface NewChat {
  model: string
  title?: string
  itemId?: string
  context?: ChatContext
}

export async function createChatIn(db: IDBDatabase, chat: NewChat): Promise<Chat> {
  const now = Date.now()
  const row: Chat = {
    id: crypto.randomUUID(),
    title: chat.title ?? 'New chat',
    model: chat.model,
    createdAt: now,
    updatedAt: now,
    ...(chat.itemId !== undefined ? { itemId: chat.itemId } : {}),
    ...(chat.context !== undefined ? { context: chat.context } : {}),
  }

  const tx = db.transaction(STORES.chats, 'readwrite')
  tx.objectStore(STORES.chats).add(row)
  await done(tx)
  return row
}

/**
 * Appends a turn, marks the conversation as active, and returns the new row's seq.
 *
 * All of it in one transaction: a message whose conversation still claims to
 * have been idle since yesterday would sort to the wrong end of the history.
 *
 * The seq is returned because an assistant turn is written empty and then grown
 * as the reply streams — see `replaceMessageIn`.
 */
export async function appendMessageIn(
  db: IDBDatabase,
  chatId: string,
  role: ChatMessage['role'],
  content: string,
): Promise<number> {
  const at = Date.now()
  const tx = db.transaction([STORES.chats, STORES.messages], 'readwrite')
  const added = tx.objectStore(STORES.messages).add({ chatId, role, content, at })

  const chats = tx.objectStore(STORES.chats)
  const existing = chats.get(chatId)
  existing.onsuccess = () => {
    const chat = existing.result as Chat | undefined
    if (!chat) return
    // The first thing said names the conversation, so an untitled chat takes
    // its title from the opening user turn.
    const title = chat.title === 'New chat' && role === 'user' ? titleFrom(content) : chat.title
    chats.put({ ...chat, title, updatedAt: at })
  }

  await done(tx)
  return added.result as number
}

/** Grows a turn that was written empty, as its reply streams in. */
export async function replaceMessageIn(
  db: IDBDatabase,
  seq: number,
  content: string,
): Promise<void> {
  const tx = db.transaction(STORES.messages, 'readwrite')
  const messages = tx.objectStore(STORES.messages)
  const existing = messages.get(seq)
  existing.onsuccess = () => {
    const message = existing.result as ChatMessage | undefined
    if (message) messages.put({ ...message, content })
  }
  await done(tx)
}

/** Most recently active first. */
export async function listChatsIn(db: IDBDatabase, limit = 100): Promise<Chat[]> {
  const tx = db.transaction(STORES.chats, 'readonly')
  const all = (await request(tx.objectStore(STORES.chats).getAll())) as Chat[]
  return all.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, limit)
}

export async function readChatIn(db: IDBDatabase, id: string): Promise<Chat | undefined> {
  const tx = db.transaction(STORES.chats, 'readonly')
  return (await request(tx.objectStore(STORES.chats).get(id))) as Chat | undefined
}

export async function readMessagesIn(db: IDBDatabase, chatId: string): Promise<ChatMessage[]> {
  const tx = db.transaction(STORES.messages, 'readonly')
  const rows = (await request(
    tx.objectStore(STORES.messages).index('by-chat').getAll(chatId),
  )) as ChatMessage[]
  // The index is on chatId alone, so ordering within a chat is not promised.
  return rows.sort((a, b) => a.seq - b.seq)
}

export async function setChatModelIn(db: IDBDatabase, id: string, model: string): Promise<void> {
  const tx = db.transaction(STORES.chats, 'readwrite')
  const chats = tx.objectStore(STORES.chats)
  const existing = chats.get(id)
  existing.onsuccess = () => {
    const chat = existing.result as Chat | undefined
    if (chat) chats.put({ ...chat, model })
  }
  await done(tx)
}

/** Removes a conversation and everything said in it. */
export async function deleteChatIn(db: IDBDatabase, id: string): Promise<void> {
  const tx = db.transaction([STORES.chats, STORES.messages], 'readwrite')
  tx.objectStore(STORES.chats).delete(id)

  const cursor = tx.objectStore(STORES.messages).index('by-chat').openCursor(id)
  cursor.onsuccess = () => {
    const at = cursor.result
    if (!at) return
    at.delete()
    at.continue()
  }

  await done(tx)
}

export async function createChat(chat: NewChat): Promise<Chat> {
  return createChatIn(await chatDb(), chat)
}

export async function appendMessage(
  chatId: string,
  role: ChatMessage['role'],
  content: string,
): Promise<number> {
  return appendMessageIn(await chatDb(), chatId, role, content)
}

export async function replaceMessage(seq: number, content: string): Promise<void> {
  return replaceMessageIn(await chatDb(), seq, content)
}

export async function listChats(limit?: number): Promise<Chat[]> {
  return listChatsIn(await chatDb(), limit)
}

export async function readChat(id: string): Promise<Chat | undefined> {
  return readChatIn(await chatDb(), id)
}

export async function readMessages(chatId: string): Promise<ChatMessage[]> {
  return readMessagesIn(await chatDb(), chatId)
}

export async function setChatModel(id: string, model: string): Promise<void> {
  return setChatModelIn(await chatDb(), id, model)
}

export async function deleteChat(id: string): Promise<void> {
  return deleteChatIn(await chatDb(), id)
}
