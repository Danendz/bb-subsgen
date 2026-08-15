import { loadSettings, saveSettings, nextFontSize } from './shared/settings'
import {
  isFlashcardsMessage,
  isLlmMessage,
  isLookupDefsMessage,
  type FlashcardsMessage,
  type LlmMessage,
  type LookupDefsResponse,
} from './shared/messages'
import {
  cancelPass,
  reportPlayhead,
  setChatBusy,
  startPass,
} from './background/llm-translate'
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

function handleLlm(msg: LlmMessage, tabId: number | undefined): void {
  switch (msg.type) {
    case 'bb-subsgen:llm-translate-track':
      // A pass exists to paint a tab; without one there is nothing to paint.
      if (tabId === undefined) return
      void startPass({
        tabId,
        bvid: msg.bvid,
        lang: msg.lang,
        model: msg.model,
        baseUrl: msg.baseUrl,
        ...(msg.video ? { video: msg.video } : {}),
        cues: msg.cues,
      }).catch((e: unknown) => console.warn('[bb-subsgen] translation pass failed', e))
      return
    case 'bb-subsgen:llm-playhead':
      if (tabId !== undefined) reportPlayhead(tabId, msg.index)
      return
    case 'bb-subsgen:llm-cancel':
      cancelPass(tabId)
      return
    case 'bb-subsgen:llm-busy':
      // From the app page or the drawer, which have no tab of the pass's own.
      setChatBusy(msg.busy)
      return
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
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

  if (isLlmMessage(msg)) {
    handleLlm(msg, sender.tab?.id)
    return
  }
})

// A tab closing while its pass is running leaves nothing to paint; the pass is
// otherwise happy to keep a GPU busy for half an hour on nobody's behalf.
chrome.tabs.onRemoved.addListener((tabId) => cancelPass(tabId))

// The mirror is what content scripts read to decide what to annotate, and it
// lives in chrome.storage.local — which survives the worker but not a fresh
// install or a restored profile. Rebuilding it on startup keeps it honest
// without making every read pay for a database round trip.
chrome.runtime.onStartup.addListener(() => void refreshKnownMirror())
chrome.runtime.onInstalled.addListener(() => void refreshKnownMirror())
