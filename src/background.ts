import { loadSettings, saveSettings, nextFontSize } from './shared/settings'

chrome.commands.onCommand.addListener(async (command) => {
  const settings = await loadSettings()
  if (command === 'toggle-pinyin') {
    await saveSettings({ showPinyin: !settings.showPinyin })
  } else if (command === 'cycle-font-size') {
    await saveSettings({ fontSize: nextFontSize(settings.fontSize) })
  }
})
