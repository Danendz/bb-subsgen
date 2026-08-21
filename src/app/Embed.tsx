// This page, framed inside the video.
//
// The content script cannot reach a local model server — it runs on Bilibili's
// origin, so CORS and Chrome's private-network rules both stand in the way —
// but this page can, because it is the extension's own. So the drawer on the
// video is an iframe of this, and everything below the header is the same panel
// the Chat tab uses.
//
// The frame and the page it sits in can only exchange messages, which is why
// closing is a postMessage rather than a call.

import { useEffect, useRef, useState } from 'preact/hooks'
import { CLOSE_EXPLAIN } from '../content/explain-drawer'
import { ChatPanel } from './chat/ChatPanel'
import { explainQuestion, openExplainChat } from './chat/explain'

function close(): void {
  // A bare signal with no data in it, so the wildcard target costs nothing —
  // and the parent is Bilibili's page, whose origin is not ours to assume.
  parent.postMessage({ type: CLOSE_EXPLAIN }, '*')
}

export function Embed() {
  const params = new URLSearchParams(location.search)
  const line = params.get('line') ?? ''
  const word = params.get('word') ?? undefined
  const videoId = params.get('videoId') ?? undefined
  const start = params.get('start')
  const sourceTitle = params.get('title') ?? undefined

  const [chatId, setChatId] = useState<string | null>(null)
  const [failed, setFailed] = useState('')
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true

    if (!line) {
      setFailed('There was no line to explain.')
      return
    }

    void openExplainChat({
      line,
      ...(word !== undefined ? { target: word } : {}),
      ...(videoId !== undefined ? { videoId } : {}),
      ...(start !== null ? { start: Number(start) } : {}),
      ...(sourceTitle !== undefined ? { sourceTitle } : {}),
    }).then(setChatId, (e: unknown) => {
      console.warn('[bb-subsgen] could not open an explanation', e)
      setFailed('Could not start that conversation. The model log in Data has the details.')
    })
  }, [line])

  // Escape typed inside the frame never reaches the page, so it is handled here
  // as well as there.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [])

  return (
    <div class="embed">
      <header class="drawer-head">
        <strong class="grow">Explain</strong>
        <a
          class="small"
          href={chatId ? `#/chat/${chatId}` : '#/chat'}
          target="_blank"
          rel="noreferrer"
        >
          Open in flashcards
        </a>
        <button class="ghost icon-btn" onClick={close} aria-label="Close">
          ✕
        </button>
      </header>

      {failed ? (
        <p class="panel small">{failed}</p>
      ) : chatId ? (
        <ChatPanel chatId={chatId} autoAsk={explainQuestion(word)} />
      ) : (
        <p class="panel muted small">Reading the scene…</p>
      )}
    </div>
  )
}
