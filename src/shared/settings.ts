/** Whether the translated line shares the subtitle card or sits in its own below it. */
export type TranslationLayout = 'inline' | 'card'

/**
 * Target language for the translated line.
 *
 * Both pairs are verified against Chrome's Translator API as directly
 * supported (zh→en and zh→ru both resolve), so neither needs to pivot
 * through a second translator. Adding a third means verifying it too.
 */
export type TranslationLang = 'en' | 'ru'

export const TRANSLATION_LANGS: ReadonlyArray<{ code: TranslationLang; label: string }> = [
  { code: 'en', label: 'English' },
  { code: 'ru', label: 'Русский' },
]

/**
 * Key held to make the page reader look words up.
 *
 * Held rather than toggled: reading a page normally should cost nothing and
 * show nothing, and a held key also means the mousemove handler does no work
 * unless you've asked for a lookup.
 */
export type ReaderModifier = 'shift' | 'alt' | 'ctrl'

export const READER_MODIFIERS: ReadonlyArray<{ code: ReaderModifier; label: string }> = [
  { code: 'shift', label: 'Shift' },
  { code: 'alt', label: 'Alt' },
  { code: 'ctrl', label: 'Ctrl' },
]

export interface Settings {
  enabled: boolean
  showPinyin: boolean
  showToneColors: boolean
  fontSize: number // px, hanzi row
  wordSpacing: number // px, gap between word groups
  backdropOpacity: number // 0-100
  positionPercent: number // distance from the bottom of the player, 0-85
  useTraditional: boolean
  /** Step the card above Bilibili's control bar while the bar is showing. */
  liftAboveControls: boolean
  showTranslation: boolean
  translationFontSize: number // px, translated line
  translationLayout: TranslationLayout
  translationLang: TranslationLang
  /**
   * Origins the page reader runs on, e.g. `https://zhihu.com`.
   *
   * Chrome's granted host permissions are the real gate — the reader can't be
   * injected without one — but this is what the popup renders and what the
   * content script checks, so revoking permission and switching the toggle off
   * stay in step.
   */
  readerOrigins: string[]
  readerModifier: ReaderModifier
  readerSentenceTranslation: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  enabled: true,
  showPinyin: true,
  showToneColors: true,
  fontSize: 32,
  wordSpacing: 8,
  backdropOpacity: 60,
  positionPercent: 8,
  useTraditional: false,
  // On by default: at the 8% default height the card lands underneath the
  // timeline, so the collision this avoids is the normal case.
  liftAboveControls: true,
  // Off by default: no language pack download, and no change for anyone who
  // hasn't asked for translation.
  showTranslation: false,
  translationFontSize: 16,
  translationLayout: 'inline',
  translationLang: 'en',
  // Empty by default: the reader is opt-in per site and asks for the host
  // permission at the moment you turn it on.
  readerOrigins: [],
  readerModifier: 'shift',
  readerSentenceTranslation: true,
}

const STORAGE_KEY = 'bbSubsgenSettings'

export async function loadSettings(): Promise<Settings> {
  const stored = await chrome.storage.sync.get(STORAGE_KEY)
  const saved = stored[STORAGE_KEY] as Partial<Settings> | undefined
  return { ...DEFAULT_SETTINGS, ...saved }
}

export async function saveSettings(patch: Partial<Settings>): Promise<void> {
  const current = await loadSettings()
  await chrome.storage.sync.set({ [STORAGE_KEY]: { ...current, ...patch } })
}

export function onSettingsChanged(callback: (settings: Settings) => void): () => void {
  const listener = (
    changes: { [key: string]: chrome.storage.StorageChange },
    areaName: string,
  ) => {
    if (areaName !== 'sync' || !changes[STORAGE_KEY]) return
    const saved = changes[STORAGE_KEY].newValue as Partial<Settings> | undefined
    callback({ ...DEFAULT_SETTINGS, ...saved })
  }
  chrome.storage.onChanged.addListener(listener)
  return () => chrome.storage.onChanged.removeListener(listener)
}

/** Cycles font size through a fixed step sequence, wrapping at the ends. */
const FONT_SIZE_STEPS = [22, 26, 29, 32, 36, 40, 46]

export function nextFontSize(current: number): number {
  const idx = FONT_SIZE_STEPS.findIndex((s) => s >= current)
  if (idx === -1) return FONT_SIZE_STEPS[0]
  if (FONT_SIZE_STEPS[idx] === current) {
    return FONT_SIZE_STEPS[(idx + 1) % FONT_SIZE_STEPS.length]
  }
  return FONT_SIZE_STEPS[idx]
}
