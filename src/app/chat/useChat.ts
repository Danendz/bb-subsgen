import { useCallback, useEffect, useRef, useState } from 'preact/hooks'
import {
  appendMessage,
  readChat,
  readMessages,
  replaceMessage,
  setChatModel,
} from '../../chat/store'
import type { Chat, ChatMessage } from '../../chat/types'
import { listModels, streamChatCompletion } from '../../llm/client'
import { log } from '../../llm/log'
import { systemFor } from '../../llm/prompts'
import { stripThinkBlocks } from '../../llm/reply'
import type { LlmMessage } from '../../llm/types'
import { loadSettings, type Settings } from '../../shared/settings'

/**
 * The models the configured server has, fetched once per page load.
 *
 * Module-scoped rather than per-component: the tab and the drawer both want the
 * list, and asking the server twice for something that changes when you load a
 * different model — not while you are reading — is waste.
 */
let modelsOnce: Promise<string[]> | null = null

export function useModels(): string[] {
  const [models, setModels] = useState<string[]>([])

  useEffect(() => {
    if (!modelsOnce) {
      modelsOnce = loadSettings()
        .then((s) => (s.llmEnabled && s.llmBaseUrl ? listModels({ baseUrl: s.llmBaseUrl, log }) : []))
        .catch((e: unknown) => {
          // Never cache a failure, or a server started late stays invisible
          // until the page is reloaded.
          modelsOnce = null
          console.warn('[bb-subsgen] model list failed', e)
          return []
        })
    }

    let live = true
    void modelsOnce.then((found) => live && setModels(found))
    return () => {
      live = false
    }
  }, [])

  return models
}

export interface ChatSession {
  chat: Chat | null
  messages: ChatMessage[]
  /** The reply currently arriving, or null when nothing is in flight. */
  streaming: string | null
  busy: boolean
  error: string | null
  send: (text: string) => Promise<void>
  stop: () => void
  chooseModel: (model: string) => Promise<void>
}

/**
 * One conversation, streamed.
 *
 * The reply is written to the database once, when it finishes — not per token.
 * A 27B model emits a few hundred tokens per reply and IndexedDB would take
 * every one of them as a transaction; what is on screen mid-flight is component
 * state, and the store only ever sees a whole turn. The empty row is written up
 * front so an interrupted reply still has somewhere to land.
 */
export function useChat(chatId: string | null): ChatSession {
  const [chat, setChat] = useState<Chat | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [streaming, setStreaming] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [settings, setSettings] = useState<Settings | null>(null)
  const abort = useRef<AbortController | null>(null)

  useEffect(() => {
    loadSettings().then(setSettings, (e: unknown) =>
      console.warn('[bb-subsgen] settings read failed', e),
    )
  }, [])

  useEffect(() => {
    if (!chatId) {
      setChat(null)
      setMessages([])
      return
    }

    let live = true
    void Promise.all([readChat(chatId), readMessages(chatId)]).then(
      ([found, said]) => {
        if (!live) return
        setChat(found ?? null)
        setMessages(said)
      },
      (e: unknown) => console.warn('[bb-subsgen] chat read failed', e),
    )
    return () => {
      live = false
    }
  }, [chatId])

  // Leaving mid-reply must not leave a request generating against the server.
  useEffect(() => () => abort.current?.abort(), [])

  const stop = useCallback(() => abort.current?.abort(), [])

  const send = useCallback(
    async (text: string) => {
      if (!chat || !settings || busy) return

      const model = chat.model || settings.llmChatModel
      if (!settings.llmBaseUrl || !model) {
        setError('Set a model server and a chat model in the extension popup first.')
        return
      }

      setError(null)
      setBusy(true)
      setStreaming('')

      const controller = new AbortController()
      abort.current = controller

      // Written before the request so an interrupted reply has a row to land in.
      const userSeq = await appendMessage(chat.id, 'user', text)
      const replySeq = await appendMessage(chat.id, 'assistant', '')
      const at = Date.now()
      setMessages((prev) => [
        ...prev,
        { seq: userSeq, chatId: chat.id, role: 'user', content: text, at },
      ])

      // The system prompt is rebuilt from the stored context on every turn, so
      // a conversation started weeks ago gets today's wording.
      const history: LlmMessage[] = [
        { role: 'system', content: systemFor(settings.translationLang, chat.context) },
        ...messages.map((m) => ({ role: m.role, content: m.content })),
        { role: 'user', content: text },
      ]

      let reply = ''
      try {
        const result = await streamChatCompletion({
          baseUrl: settings.llmBaseUrl,
          model,
          messages: history,
          signal: controller.signal,
          log,
          onDelta: (delta) => {
            reply += delta
            // Reasoning models emit their scratchpad inline; stripping as it
            // arrives keeps it off the screen rather than flashing it up and
            // removing it when the closing tag lands.
            setStreaming(stripThinkBlocks(reply))
          },
        })
        reply = stripThinkBlocks(result.content)
      } catch (e) {
        const aborted = controller.signal.aborted
        reply = stripThinkBlocks(reply)
        if (!aborted) setError(e instanceof Error ? e.message : String(e))
      }

      await replaceMessage(replySeq, reply)
      setMessages((prev) => [
        ...prev,
        { seq: replySeq, chatId: chat.id, role: 'assistant', content: reply, at: Date.now() },
      ])
      setStreaming(null)
      setBusy(false)
      abort.current = null

      // The title is set by the store on the opening turn; re-read so the
      // history list and the header agree with it.
      void readChat(chat.id).then((fresh) => fresh && setChat(fresh))
    },
    [chat, settings, busy, messages],
  )

  const chooseModel = useCallback(
    async (model: string) => {
      if (!chat) return
      await setChatModel(chat.id, model)
      setChat({ ...chat, model })
    },
    [chat],
  )

  return { chat, messages, streaming, busy, error, send, stop, chooseModel }
}
