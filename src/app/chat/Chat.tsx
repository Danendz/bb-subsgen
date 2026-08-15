import { useCallback, useState } from 'preact/hooks'
import { createChat, deleteChat, listChats } from '../../chat/store'
import { loadSettings } from '../../shared/settings'
import { navigate, useAsync } from '../hooks'
import { ChatPanel } from './ChatPanel'
import { useModels } from './useChat'

function when(at: number): string {
  const days = Math.floor((Date.now() - at) / 86_400_000)
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days} days ago`
  return new Date(at).toLocaleDateString()
}

/**
 * The Chat tab: a list of conversations beside the open one.
 *
 * The route carries the conversation id (`#/chat/<id>`), so a chat can be linked
 * to — which is what the explain drawer's "open full width" does.
 */
export function Chat({ chatId }: { chatId?: string }) {
  const [nonce, setNonce] = useState(0)
  const models = useModels()

  const load = useCallback(() => listChats(), [nonce])
  const { data: chats, reload } = useAsync(load)

  const startChat = async () => {
    const settings = await loadSettings()
    // A model is required to send, not to start: picking one in the panel is a
    // reasonable way to recover from having none set.
    const chat = await createChat({ model: settings.llmChatModel || models[0] || '' })
    setNonce((n) => n + 1)
    navigate(`/chat/${chat.id}`)
  }

  const remove = async (id: string) => {
    if (!confirm('Delete this conversation?')) return
    await deleteChat(id)
    if (id === chatId) navigate('/chat')
    reload()
  }

  return (
    <div class="chat-layout">
      <div class="panel chat-list">
        <div class="toolbar">
          <button class="primary grow" onClick={() => void startChat()}>
            New chat
          </button>
        </div>

        {chats?.length === 0 && (
          <p class="muted small">
            Nothing yet. Start one here, or press Explain on a card while reviewing.
          </p>
        )}

        {chats?.map((chat) => (
          <div class={`row chat-row ${chat.id === chatId ? 'on' : ''}`} key={chat.id}>
            <button class="link-btn grow" onClick={() => navigate(`/chat/${chat.id}`)}>
              <span class="chat-title">{chat.title}</span>
              <span class="muted small">
                {when(chat.updatedAt)}
                {chat.context ? ' · from a card' : ''}
              </span>
            </button>
            <button class="ghost icon-btn" onClick={() => void remove(chat.id)}>
              ✕
            </button>
          </div>
        ))}
      </div>

      <div class="panel chat-open">
        {chatId ? (
          <ChatPanel chatId={chatId} />
        ) : (
          <div class="empty">
            <p>Pick a conversation, or start a new one.</p>
            <p class="muted small">
              Explanations opened from a card while reviewing land here too.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
