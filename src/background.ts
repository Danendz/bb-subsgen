import { loadSettings, onSettingsChanged, saveSettings, nextFontSize } from './shared/settings'
import {
  isAsrMessage,
  isDictChangedMessage,
  isDictStatusMessage,
  isFlashcardsMessage,
  isGetLexiconMessage,
  isGetPassStatusMessage,
  isGetTranscriptStatusMessage,
  isLlmMessage,
  isLookupDefsMessage,
  type AsrMessage,
  type DictStatus,
  type DictStatusResponse,
  type FlashcardsMessage,
  type GetLexiconResponse,
  type LlmMessage,
  type LookupDefsResponse,
  type PassStatusResponse,
  type TranscriptStatusResponse,
} from './shared/messages'
import {
  cancelTranscription,
  handleOffscreenEvent,
  reportAsrPlayhead,
  retryTranscription,
  startTranscription,
  transcriptStatus,
  watchAsrTab,
} from './background/asr-pass'
import {
  cancelPass,
  cancelPassIfNavigatedAway,
  passStatus,
  watchTabLiveness,
  reportPlayhead,
  setChatBusy,
  startPass,
} from './background/llm-translate'
import { dictDb, getAllMeta, getLexiconIn, lookupDefs } from './dict/store'
import { refreshBadge } from './background/badge'
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

/** What the popup and the setup wizard ask for: per enabled language, whether it's installed. */
async function getDictStatus(): Promise<DictStatus[]> {
  const [settings, db] = await Promise.all([loadSettings(), dictDb()])
  const meta = await getAllMeta(db)
  return settings.enabledLanguages.map((lang) => {
    const installed = meta[lang]
    return {
      lang,
      installed: installed !== undefined,
      entryCount: installed?.entryCount ?? 0,
      installedAt: installed?.installedAt ?? null,
    }
  })
}

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
        videoId: msg.videoId,
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

function handleAsr(msg: AsrMessage, tabId: number | undefined): void {
  switch (msg.type) {
    case 'bb-subsgen:asr-transcribe':
      // A transcript exists to paint a tab; without one there is nothing to paint.
      if (tabId === undefined) return
      void startTranscription(tabId, {
        videoId: msg.videoId,
        audio: msg.audio,
        model: msg.model,
        baseUrl: msg.baseUrl,
        playhead: msg.playhead,
      }).catch((e: unknown) => console.warn('[bb-subsgen] transcription failed', e))
      return
    case 'bb-subsgen:asr-cancel':
      void cancelTranscription(tabId)
      return
    case 'bb-subsgen:asr-playhead':
      if (tabId !== undefined) void reportAsrPlayhead(tabId, msg.seconds)
      return
    case 'bb-subsgen:asr-retry': {
      // From the popup, which carries the tab explicitly because it has none of
      // its own, or from the overlay, which does.
      const target = msg.tabId ?? tabId
      if (target !== undefined) {
        void retryTranscription(target).catch((e: unknown) =>
          console.warn('[bb-subsgen] retry failed', e),
        )
      }
      return
    }
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // First, because these come from the offscreen document rather than a tab and
  // match none of the guards below.
  if (handleOffscreenEvent(msg)) return

  if (isGetPassStatusMessage(msg)) {
    // Synchronous: the pass keeps its own counters, so there is nothing to await.
    sendResponse({ status: passStatus(msg.tabId) } satisfies PassStatusResponse)
    return
  }

  if (isGetTranscriptStatusMessage(msg)) {
    // Asynchronous, unlike the pass above: a transcription's state lives in
    // session storage so that it survives this worker being shut down as idle
    // mid-run, which is exactly when somebody opens the popup to ask about it.
    transcriptStatus(msg.tabId).then(
      (status) => sendResponse({ status } satisfies TranscriptStatusResponse),
      (e) => {
        console.warn('[bb-subsgen] transcript status failed', e)
        sendResponse({ status: null } satisfies TranscriptStatusResponse)
      },
    )
    // Keeps the message channel open for the async response above.
    return true
  }

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

  if (isGetLexiconMessage(msg)) {
    dictDb()
      .then((db) => getLexiconIn(db, msg.lang))
      .then(
        (text) => sendResponse({ text } satisfies GetLexiconResponse),
        (e) => {
          console.warn('[bb-subsgen] lexicon fetch failed in worker', e)
          sendResponse({ text: null } satisfies GetLexiconResponse)
        },
      )
    // Keeps the message channel open for the async response above.
    return true
  }

  if (isDictStatusMessage(msg)) {
    getDictStatus().then(
      (languages) => sendResponse({ languages } satisfies DictStatusResponse),
      (e) => {
        console.warn('[bb-subsgen] dict status failed', e)
        sendResponse({ languages: [] } satisfies DictStatusResponse)
      },
    )
    // Keeps the message channel open for the async response above.
    return true
  }

  if (isDictChangedMessage(msg)) {
    void refreshBadge()
    return
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

  if (isAsrMessage(msg)) {
    handleAsr(msg, sender.tab?.id)
    return
  }
})

// A tab closing while its pass is running leaves nothing to paint; the pass is
// otherwise happy to keep a GPU busy for half an hour on nobody's behalf.
chrome.tabs.onRemoved.addListener((tabId) => {
  cancelPass(tabId)
  void cancelTranscription(tabId)
})

// And the same tab navigating somewhere else without closing, which the content
// script cannot report because the navigation is what destroys it. Only fires
// when the URL actually changed — onUpdated is also how a tab announces its
// title, its favicon and its load state.
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.url) cancelPassIfNavigatedAway(tabId, changeInfo.url)
})

// And the case neither of the above can see: a tab leaving Bilibili entirely.
// `changeInfo.url` is only populated for URLs the extension has permission for,
// so the listener above goes quiet at exactly the moment it is most needed. The
// port has no such condition — see watchTabLiveness.
//
// The transcription port is separate rather than shared. The two runs start and
// end at different moments — a pass is cancelled by switching translation off,
// which a transcript has no reason to care about — and one port cannot be
// released by one of them without silently ending the other.
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'bb-subsgen:pass') watchTabLiveness(port)
  if (port.name === 'bb-subsgen:asr') watchAsrTab(port)
})

// The mirror is what content scripts read to decide what to annotate, and it
// lives in chrome.storage.local — which survives the worker but not a fresh
// install or a restored profile. Rebuilding it on startup keeps it honest
// without making every read pay for a database round trip.
chrome.runtime.onStartup.addListener(() => void refreshKnownMirror())
chrome.runtime.onInstalled.addListener(() => void refreshKnownMirror())

// The badge reflects settings and installed dictionaries, neither of which the
// worker is told about except by these three routes: a fresh start, a settings
// write, and the wizard reporting an install or a delete.
chrome.runtime.onStartup.addListener(() => void refreshBadge())
chrome.runtime.onInstalled.addListener(() => void refreshBadge())
onSettingsChanged(() => void refreshBadge())
