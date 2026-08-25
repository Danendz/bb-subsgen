// Page-side half of the flashcards store. Content scripts run on the page's
// IndexedDB origin, so every write goes to the worker as a message — the same
// arrangement as dict-client.ts and for the same reason.

import { KNOWN_SET_KEY, knownWordsFor } from '../flashcards/known'
import type { Context, ExposureBatch, Signal } from '../flashcards/types'
import type { FlashcardsMessage } from './messages'

/**
 * Fire and forget.
 *
 * A capture is a side effect of reading, never the point of it: if the worker
 * is asleep, mid-restart, or the extension was just reloaded, the right outcome
 * is a lost exposure count, not a hover that stalls or throws into the page.
 */
function send(message: FlashcardsMessage): void {
  try {
    void chrome.runtime.sendMessage(message).catch(() => {})
  } catch {
    // Context invalidated (extension reloaded while the page stayed open).
  }
}

export function discoverWord(lang: string, headword: string, context?: Context): void {
  send({ type: 'bb-subsgen:discover-word', lang, headword, context })
}

/**
 * Keeps a line, and the words in it you don't yet know.
 *
 * One message rather than a capture plus a `discoverWord` per word: a line
 * changes every few seconds, so per-word messages would run at roughly one a
 * second for the length of a video. The worker writes all of it in a single
 * transaction — see `captureSentenceIn`.
 */
export function captureSentence(
  lang: string,
  text: string,
  context: Context,
  target?: string,
  words?: string[],
  patterns?: string[],
): void {
  send({ type: 'bb-subsgen:capture-sentence', lang, text, context, target, words, patterns })
}

export function markKnown(lang: string, headword: string, known: boolean): void {
  send({ type: 'bb-subsgen:mark-known', lang, headword, known })
}

export function recordSignal(signal: Signal): void {
  send({ type: 'bb-subsgen:record-signal', signal })
}

/** How often buffered exposures are posted to the worker. */
const FLUSH_MS = 15_000

export interface ExposureBuffer {
  /** Records the words of one rendered line. */
  line(words: string[]): void
  flush(): void
  /** Flushes what's left and detaches. */
  stop(): void
}

/**
 * Accumulates exposures in memory and posts them in batches.
 *
 * A subtitle line changes every few seconds and carries around eight words, so
 * writing per line would mean thousands of messages across a video. The buffer
 * is per video: `main.ts` builds one after resolving the videoId and stops it on
 * teardown, so a batch can never be attributed to the video that replaced it.
 */
export function createExposureBuffer(lang: string, video?: ExposureBatch['video']): ExposureBuffer {
  let words: Record<string, number> = {}
  let lines = 0
  let pending = false

  const flush = () => {
    if (!pending) return
    const batch: ExposureBatch = { video, lines, words }
    words = {}
    lines = 0
    pending = false
    send({ type: 'bb-subsgen:record-exposures', lang, batch })
  }

  const timer = setInterval(flush, FLUSH_MS)
  // Closing the tab or navigating away is the common case for the last batch of
  // a session, and it never reaches the interval.
  const onHide = () => flush()
  window.addEventListener('pagehide', onHide)

  return {
    line(seen) {
      if (!seen.length) return
      lines += 1
      pending = true
      for (const word of seen) words[word] = (words[word] ?? 0) + 1
    },
    flush,
    stop() {
      flush()
      clearInterval(timer)
      window.removeEventListener('pagehide', onHide)
    },
  }
}

/**
 * The set of words the overlay should stop annotating in one language, kept live.
 *
 * Mirrored into `chrome.storage.local` by the worker so this is a synchronous
 * read after the first load — hiding pinyin is a per-token decision on every
 * rendered line, and a message round trip per line is not viable.
 */
export function watchKnownSet(lang: string, onChange: (known: Set<string>) => void): () => void {
  void chrome.storage.local.get(KNOWN_SET_KEY).then((stored) => {
    onChange(knownWordsFor(stored[KNOWN_SET_KEY], lang))
  })

  const listener = (changes: { [key: string]: chrome.storage.StorageChange }, areaName: string) => {
    if (areaName !== 'local' || !changes[KNOWN_SET_KEY]) return
    // Lifted here too, not only on the first read: the mirror is `chrome.storage`
    // and has no upgrade hook, so a change event carrying the old array shape
    // would otherwise empty the set on the page.
    onChange(knownWordsFor(changes[KNOWN_SET_KEY].newValue, lang))
  }
  chrome.storage.onChanged.addListener(listener)
  return () => chrome.storage.onChanged.removeListener(listener)
}
