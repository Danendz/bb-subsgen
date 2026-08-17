import { useEffect, useRef } from 'preact/hooks'
import type { ChatContext, ChatMessage } from '../../chat/types'
import { renderable, type Span } from './markdown'
import { useChat, useModels } from './useChat'

function Spans({ spans }: { spans: Span[] }) {
  return (
    <>
      {spans.map((span, i) =>
        span.kind === 'bold' ? (
          <strong key={i}>{span.text}</strong>
        ) : span.kind === 'code' ? (
          <code key={i}>{span.text}</code>
        ) : (
          <span key={i}>{span.text}</span>
        ),
      )}
    </>
  )
}

function Bubble({ role, content }: { role: ChatMessage['role']; content: string }) {
  return (
    <div class={`turn ${role}`}>
      {renderable(content).map((spans, i) => (
        <p key={i}>
          <Spans spans={spans} />
        </p>
      ))}
    </div>
  )
}

/**
 * The passage the model was given, on demand.
 *
 * Collapsed by default and available always: when an explanation looks wrong,
 * the first question is what it was actually looking at, and the answer should
 * not require opening the debug log.
 */
function Passage({ context }: { context: ChatContext }) {
  const lines = context.before.length + context.after.length + 1

  return (
    <details class="passage">
      <summary class="muted small">
        Context sent — {lines} line{lines === 1 ? '' : 's'}
        {context.sourceTitle ? ` from ${context.sourceTitle}` : ''}
      </summary>
      <div class="passage-lines">
        {context.before.map((line, i) => (
          <p key={`b${i}`} class="muted">
            {line}
          </p>
        ))}
        <p class="passage-line">{context.line}</p>
        {context.after.map((line, i) => (
          <p key={`a${i}`} class="muted">
            {line}
          </p>
        ))}
      </div>
    </details>
  )
}

export interface ChatPanelProps {
  chatId: string | null
  /**
   * A question to ask as soon as the conversation is empty.
   *
   * How the explain button arrives already working: the drawer opens onto a
   * reply being written rather than onto a blank box you have to think of
   * something to type into.
   */
  autoAsk?: string
  /** Called when the conversation row changed — the history list redraws on it. */
  onChanged?: () => void
}

/**
 * One conversation: transcript, composer, and the model it is running on.
 *
 * Shared by the Chat tab and the explain drawer — they differ in what wraps
 * them, not in how a conversation behaves.
 */
export function ChatPanel({ chatId, autoAsk, onChanged }: ChatPanelProps) {
  const { chat, messages, streaming, busy, error, send, stop, chooseModel } = useChat(chatId, {
    ...(onChanged ? { onChanged } : {}),
  })
  const models = useModels()
  const input = useRef<HTMLTextAreaElement>(null)
  const bottom = useRef<HTMLDivElement>(null)
  const asked = useRef(false)

  // Once, and only into an empty conversation — reopening an explanation from
  // the history must not ask it all over again.
  useEffect(() => {
    if (!autoAsk || asked.current || !chat || busy || messages.length > 0) return
    asked.current = true
    void send(autoAsk)
  }, [autoAsk, chat, busy, messages.length, send])

  // Follow the reply as it grows, so a long explanation doesn't scroll off.
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' })
  }, [messages.length, streaming])

  const submit = () => {
    const text = input.current?.value.trim()
    if (!text || busy) return
    if (input.current) input.current.value = ''
    void send(text)
  }

  if (!chat) return <div class="panel muted small">No conversation selected.</div>

  const options = Array.from(new Set([chat.model, ...models].filter(Boolean)))
  // The empty assistant row is written before the request, so it is already in
  // `messages` while the reply is still arriving — render the live text instead.
  const shown = busy ? messages.filter((m) => m.content !== '') : messages

  return (
    <div class="chat">
      <div class="chat-head">
        <select
          class="model"
          value={chat.model}
          disabled={busy}
          onChange={(e) => void chooseModel(e.currentTarget.value)}
        >
          {options.map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>
        {busy && (
          <button class="ghost icon-btn" onClick={stop}>
            Stop
          </button>
        )}
      </div>

      <div class="transcript">
        {chat.context && <Passage context={chat.context} />}

        {shown.map((message) => (
          <Bubble key={message.seq} role={message.role} content={message.content} />
        ))}

        {streaming !== null && (
          <div class="turn assistant">
            {streaming ? (
              renderable(streaming).map((spans, i) => (
                <p key={i}>
                  <Spans spans={spans} />
                </p>
              ))
            ) : (
              // A local 27B can sit silent for fifteen seconds before its first
              // token; without this the panel looks like it did nothing.
              <p class="muted small">Thinking…</p>
            )}
          </div>
        )}

        {error && <p class="small verdict no">{error}</p>}
        <div ref={bottom} />
      </div>

      <div class="composer">
        <textarea
          ref={input}
          rows={2}
          placeholder="Ask about this line, or anything else…"
          onKeyDown={(e) => {
            // Enter sends, Shift+Enter breaks the line — what every chat does.
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              submit()
            }
          }}
        />
        <button class="primary" disabled={busy} onClick={submit}>
          Send
        </button>
      </div>
    </div>
  )
}
