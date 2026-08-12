import { loadSettings, saveSettings, nextFontSize } from './shared/settings'
import { isLookupDefsMessage, type LookupDefsResponse } from './shared/messages'
import { lookupDefs } from './background/defs-store'

chrome.commands.onCommand.addListener(async (command) => {
  const settings = await loadSettings()
  if (command === 'toggle-pinyin') {
    await saveSettings({ showPinyin: !settings.showPinyin })
  } else if (command === 'cycle-font-size') {
    await saveSettings({ fontSize: nextFontSize(settings.fontSize) })
  }
})

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!isLookupDefsMessage(msg)) return

  lookupDefs(msg.headwords).then(
    (entries) => sendResponse({ entries } satisfies LookupDefsResponse),
    (e) => {
      console.warn('[bb-subsgen] defs lookup failed in worker', e)
      sendResponse({ entries: {} } satisfies LookupDefsResponse)
    },
  )
  // Keeps the message channel open for the async response above.
  return true
})
