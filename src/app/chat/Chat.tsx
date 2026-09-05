import { useCallback, useState } from 'preact/hooks'
import { createChat, deleteChat, listChats } from '../../chat/store'
import { loadSettings } from '../../shared/settings'
import { navigate, useAsync } from '../hooks'
import { ChatPanel } from './ChatPanel'
import { useModels } from './useChat'
import { useT } from '../../i18n/useT'
import type { Locale } from '../../i18n/useT'

function when(at: number, { t, lang }: Locale): string {
  const days = Math.floor((Date.now() - at) / 86_400_000)
  if (days === 0) return t('chat.when.today')
  if (days === 1) return t('chat.when.yesterday')
  if (days < 7) return t('chat.when.daysAgo', { count: days })
  return new Date(at).toLocaleDateString(lang)
}

/**
 * The Chat tab: a list of conversations beside the open one.
 *
 * The route carries the conversation id (`#/chat/<id>`), so a chat can be linked
 * to — which is what the explain drawer's "open full width" does.
 */
export function Chat({ chatId }: { chatId?: string }) {
  const locale = useT()
  const { t } = locale
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
    if (!confirm(t('chat.deleteConfirm'))) return
    await deleteChat(id)
    if (id === chatId) navigate('/chat')
    reload()
  }

  return (
    <div class="chat-layout">
      <div class="panel chat-list">
        <div class="toolbar">
          <button class="primary grow" onClick={() => void startChat()}>
            {t('chat.new')}
          </button>
        </div>

        {chats?.length === 0 && <p class="muted small">{t('chat.empty')}</p>}

        {chats?.map((chat) => (
          <div class={`row chat-row ${chat.id === chatId ? 'on' : ''}`} key={chat.id}>
            <button class="row-btn grow" onClick={() => navigate(`/chat/${chat.id}`)}>
              <span class="chat-title">{chat.title}</span>
              <span class="muted small">
                {[when(chat.updatedAt, locale), ...(chat.context ? [t('chat.fromCard')] : [])].join(
                  ' \u00b7 ',
                )}
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
          <ChatPanel chatId={chatId} onChanged={reload} />
        ) : (
          <div class="empty">
            <p>{t('chat.pick')}</p>
            <p class="muted small">{t('chat.pickHint')}</p>
          </div>
        )}
      </div>
    </div>
  )
}
