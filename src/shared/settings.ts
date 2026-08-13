import type { StudyInclude, StudyMode } from '../flashcards/types'

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
  /**
   * Withhold every reading and translation until hovered, so a video can be
   * used to test yourself rather than to read along.
   *
   * Also switched on for a single page load by the `bbq=1` parameter that
   * review's jump-back link carries — arriving at a line you are being quizzed
   * on with its translation already on screen would defeat the trip.
   */
  quizMode: boolean
  /** New cards let into the deck each day. Capture is generous; intake is not. */
  newWordsPerDay: number
  newSentencesPerDay: number
  /** How the study session asks its questions. */
  studyMode: StudyMode
  /** Which cards it draws from. */
  studyInclude: StudyInclude
  /**
   * Cards per session, counted as distinct cards drawn.
   *
   * A card answered wrong comes back inside the same session without inflating
   * this, so the number is a promise about how much you are taking on rather
   * than a count of keystrokes. Without it a backlog produces a session you
   * cannot finish, which is the one thing that stops people opening the app.
   */
  studySessionSize: number
  /**
   * How long you can dwell on a line whose words you all know before it is
   * taken as evidence you couldn't read it, in milliseconds.
   *
   * A guess, deliberately exposed: every dwell is also logged raw, so the real
   * distribution can be looked at and this moved to where actual "I'm stuck"
   * pauses sit rather than where it was first set.
   */
  struggleThresholdMs: number
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
  quizMode: false,
  newWordsPerDay: 10,
  newSentencesPerDay: 5,
  // Mixed by default: meeting a word from a different angle each sitting is
  // better practice than any single mode, and it is the behaviour that existed
  // before the modes were choosable, so nobody's sessions change unasked.
  studyMode: 'mixed',
  studyInclude: 'both',
  studySessionSize: 20,
  struggleThresholdMs: 5000,
}

/** Bounds for `studySessionSize`, shared by the picker and the queue. */
export const MIN_SESSION_SIZE = 5
export const MAX_SESSION_SIZE = 50

export function clampSessionSize(size: number): number {
  if (!Number.isFinite(size)) return DEFAULT_SETTINGS.studySessionSize
  return Math.min(MAX_SESSION_SIZE, Math.max(MIN_SESSION_SIZE, Math.round(size)))
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
