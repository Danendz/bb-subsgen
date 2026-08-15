import { beforeEach, describe, expect, test, vi } from 'vitest'
import { openChatDb } from './db'
import {
  appendMessageIn,
  createChatIn,
  deleteChatIn,
  listChatsIn,
  readChatIn,
  readMessagesIn,
  replaceMessageIn,
  setChatModelIn,
  titleFrom,
} from './store'

describe('titleFrom', () => {
  test('is the opening message', () => {
    expect(titleFrom('why is 了 here?')).toBe('why is 了 here?')
  })

  test('collapses whitespace so a pasted passage still reads as one line', () => {
    expect(titleFrom('  why   is\n了\there? ')).toBe('why is 了 here?')
  })

  test('truncates a long opener', () => {
    const title = titleFrom('x'.repeat(200))

    expect(title).toHaveLength(61) // 60 plus the ellipsis
    expect(title.endsWith('…')).toBe(true)
  })

  test('falls back for an empty opener', () => {
    expect(titleFrom('   ')).toBe('New chat')
  })
})

describe('the chat store', () => {
  let db: IDBDatabase

  beforeEach(async () => {
    db = await openChatDb(`chat-${Math.random()}`)
  })

  test('creates a chat and reads it back', async () => {
    const chat = await createChatIn(db, { model: 'qwen3-8b' })

    expect(await readChatIn(db, chat.id)).toMatchObject({
      id: chat.id,
      model: 'qwen3-8b',
      title: 'New chat',
    })
  })

  test('keeps the item and context it was opened from', async () => {
    const context = { target: '了', line: '我吃了', before: ['a'], after: ['b'], bvid: 'BV1' }
    const chat = await createChatIn(db, { model: 'm', itemId: 'w:了', context })

    expect(await readChatIn(db, chat.id)).toMatchObject({ itemId: 'w:了', context })
  })

  test('stores turns in the order they were said', async () => {
    const chat = await createChatIn(db, { model: 'm' })
    await appendMessageIn(db, chat.id, 'user', 'why 了?')
    await appendMessageIn(db, chat.id, 'assistant', 'it marks completion')

    expect((await readMessagesIn(db, chat.id)).map((m) => [m.role, m.content])).toEqual([
      ['user', 'why 了?'],
      ['assistant', 'it marks completion'],
    ])
  })

  test('does not mix up two conversations', async () => {
    const one = await createChatIn(db, { model: 'm' })
    const two = await createChatIn(db, { model: 'm' })
    await appendMessageIn(db, one.id, 'user', 'first')
    await appendMessageIn(db, two.id, 'user', 'second')

    expect((await readMessagesIn(db, one.id)).map((m) => m.content)).toEqual(['first'])
    expect((await readMessagesIn(db, two.id)).map((m) => m.content)).toEqual(['second'])
  })

  test('names an untitled conversation after its opening user turn', async () => {
    const chat = await createChatIn(db, { model: 'm' })
    await appendMessageIn(db, chat.id, 'user', 'why is 了 here?')

    expect((await readChatIn(db, chat.id))!.title).toBe('why is 了 here?')
  })

  test('does not rename it again once it has a name', async () => {
    const chat = await createChatIn(db, { model: 'm' })
    await appendMessageIn(db, chat.id, 'user', 'first question')
    await appendMessageIn(db, chat.id, 'user', 'second question')

    expect((await readChatIn(db, chat.id))!.title).toBe('first question')
  })

  // An explain drawer opens with a title already set, and the opening turn is
  // the model's, not yours.
  test('leaves a title given at creation alone', async () => {
    const chat = await createChatIn(db, { model: 'm', title: 'Explain 了' })
    await appendMessageIn(db, chat.id, 'assistant', 'it marks completion')

    expect((await readChatIn(db, chat.id))!.title).toBe('Explain 了')
  })

  test('grows an assistant turn that was written empty', async () => {
    const chat = await createChatIn(db, { model: 'm' })
    const seq = await appendMessageIn(db, chat.id, 'assistant', '')
    await replaceMessageIn(db, seq, 'streamed in')

    expect((await readMessagesIn(db, chat.id))[0].content).toBe('streamed in')
  })

  test('lists conversations by last activity, not by creation', async () => {
    // Pinned: three writes inside one millisecond would otherwise leave the
    // order down to how getAll happens to return two random uuids.
    let clock = 0
    vi.spyOn(Date, 'now').mockImplementation(() => (clock += 1000))

    const older = await createChatIn(db, { model: 'm', title: 'older' })
    const newer = await createChatIn(db, { model: 'm', title: 'newer' })
    // Speaking in the older one should lift it above the one created after it.
    await appendMessageIn(db, older.id, 'assistant', 'a reply')

    expect((await listChatsIn(db)).map((c) => c.id)).toEqual([older.id, newer.id])
    vi.restoreAllMocks()
  })

  test('changes the model a conversation is running on', async () => {
    const chat = await createChatIn(db, { model: 'small' })
    await setChatModelIn(db, chat.id, 'big')

    expect((await readChatIn(db, chat.id))!.model).toBe('big')
  })

  test('deleting takes the messages with it', async () => {
    const chat = await createChatIn(db, { model: 'm' })
    const other = await createChatIn(db, { model: 'm' })
    await appendMessageIn(db, chat.id, 'user', 'gone')
    await appendMessageIn(db, other.id, 'user', 'kept')

    await deleteChatIn(db, chat.id)

    expect(await readChatIn(db, chat.id)).toBeUndefined()
    expect(await readMessagesIn(db, chat.id)).toEqual([])
    expect((await readMessagesIn(db, other.id)).map((m) => m.content)).toEqual(['kept'])
  })
})
