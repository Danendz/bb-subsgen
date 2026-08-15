import { loadSettings, saveSettings, nextFontSize } from './shared/settings'
import {
  isFlashcardsMessage,
  isLookupDefsMessage,
  type FlashcardsMessage,
  type LookupDefsResponse,
} from './shared/messages'
import { lookupDefs } from './background/defs-store'
import {
  captureSentence,
  discoverWord,
  markKnown,
  recordExposures,
  recordSignal,
  refreshKnownMirror,
} from './background/flashcards-store'

chrome.commands.onCommand.addListener(async (command) => {
  const settings = await loadSettings()
  if (command === 'toggle-pinyin') {
    await saveSettings({ showPinyin: !settings.showPinyin })
  } else if (command === 'cycle-font-size') {
    await saveSettings({ fontSize: nextFontSize(settings.fontSize) })
  } else if (command === 'toggle-quiz') {
    await saveSettings({ quizMode: !settings.quizMode })
  }
})

function handleFlashcards(msg: FlashcardsMessage): Promise<void> {
  switch (msg.type) {
    case 'bb-subsgen:record-exposures':
      return recordExposures(msg.batch)
    case 'bb-subsgen:discover-word':
      return discoverWord(msg.headword, msg.context)
    case 'bb-subsgen:capture-sentence':
      return captureSentence(msg.text, msg.context, msg.target, msg.words, msg.patterns)
    case 'bb-subsgen:mark-known':
      return markKnown(msg.headword, msg.known)
    case 'bb-subsgen:record-signal':
      return recordSignal(msg.signal)
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (isLookupDefsMessage(msg)) {
    lookupDefs(msg.headwords).then(
      (entries) => sendResponse({ entries } satisfies LookupDefsResponse),
      (e) => {
        console.warn('[bb-subsgen] defs lookup failed in worker', e)
        sendResponse({ entries: {} } satisfies LookupDefsResponse)
      },
    )
    // Keeps the message channel open for the async response above.
    return true
  }

  if (isFlashcardsMessage(msg)) {
    // Nothing awaits these — a failed capture must never surface in the page.
    handleFlashcards(msg).catch((e) => console.warn('[bb-subsgen] flashcards write failed', e))
    return
  }
})

// The mirror is what content scripts read to decide what to annotate, and it
// lives in chrome.storage.local — which survives the worker but not a fresh
// install or a restored profile. Rebuilding it on startup keeps it honest
// without making every read pay for a database round trip.
chrome.runtime.onStartup.addListener(() => void refreshKnownMirror())
chrome.runtime.onInstalled.addListener(() => void refreshKnownMirror())
