import { useEffect } from 'preact/hooks'
import { ChatPanel } from './ChatPanel'

export interface ChatDrawerProps {
  chatId: string
  autoAsk?: string
  onClose: () => void
  /**
   * Where "open full width" goes, or absent to leave it out.
   *
   * A link rather than a route change: inside the review session it is an
   * ordinary hash navigation, and inside the iframe on a video it has to open a
   * new tab, because the frame is 400px wide and belongs to Bilibili's page.
   */
  fullHref?: string
  fullTarget?: string
}

/**
 * A conversation over the top of whatever you were doing.
 *
 * The point of a drawer rather than a route: a review session holds queue
 * position, streak and timers, and the hash router would unmount all of it.
 * Asking a question about a card must not cost you the card.
 */
export function ChatDrawer({ chatId, autoAsk, onClose, fullHref, fullTarget }: ChatDrawerProps) {
  // Escape closes, as it does everywhere else a panel covers the page.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div class="drawer-scrim" onClick={onClose}>
      {/* The panel swallows clicks so only the backdrop closes. */}
      <aside class="drawer" onClick={(e) => e.stopPropagation()}>
        <header class="drawer-head">
          <strong class="grow">Explain</strong>
          {fullHref && (
            <a class="small" href={fullHref} target={fullTarget} rel="noreferrer">
              Open full width
            </a>
          )}
          <button class="ghost icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>

        <ChatPanel chatId={chatId} autoAsk={autoAsk} />
      </aside>
    </div>
  )
}
