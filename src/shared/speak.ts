// Audio for cards, from the voices the browser already has.
//
// No audio files and no service of our own: pinyin and tone colours teach the
// *symbol* of a tone, never the sound, and that gap is the one thing a reader
// extension cannot close by rendering harder.
//
// It is not quite true that nothing leaves the machine. The best Mandarin voice
// in desktop Chrome is normally one of Google's, which synthesises server-side —
// so the card text goes to Google, and the voice is gone the moment the network
// is. That request is Chrome's, not this extension's, which is why there is no
// host permission and no key here. `unusable` is what makes the trade safe: a
// remote voice that fails is struck off and the best local one speaks instead,
// so being offline costs quality rather than silence.
//
// Lives in shared/ rather than app/ because the popup needs the same voice list
// to offer a picker, and has to be able to play a test line through it.

import { clampSpeechRate, DEFAULT_SETTINGS, loadSettings, onSettingsChanged } from './settings'
import type { Settings } from './settings'

/** The parts of `SpeechSynthesisVoice` that ranking actually reads. */
export interface VoiceLike {
  name: string
  lang: string
  localService: boolean
}

/**
 * Apple's novelty voices, which ship localised into Chinese.
 *
 * These are character voices — cartoonish on purpose — and eight of them sort
 * ahead of every real one in `getVoices()`. Taking the first `zh-CN` match
 * therefore landed on `Eddy`, which is what made card audio unintelligible.
 *
 * Ranked last rather than excluded: a silly voice still beats silence, because
 * `canSpeak()` returning false withdraws audio cards from the rotation entirely
 * (see `modeFor` in ../flashcards/exercise.ts).
 */
const NOVELTY = new Set([
  'Albert', 'Bad News', 'Bahh', 'Bells', 'Boing', 'Bubbles', 'Cellos', 'Deranged',
  'Eddy', 'Flo', 'Fred', 'Good News', 'Grandma', 'Grandpa', 'Hysterical', 'Jester',
  'Junior', 'Kathy', 'Organ', 'Princess', 'Ralph', 'Reed', 'Rocko', 'Sandy',
  'Shelley', 'Superstar', 'Trinoids', 'Whisper', 'Wobble', 'Zarvox',
])

/**
 * Local voices known to be real speech engines.
 *
 * Both spellings of the Apple names are here because the platform has reported
 * each over the years (`Ting-Ting` on older macOS, `Tingting` now), and a miss
 * would quietly demote the best local voice on the machine.
 */
const KNOWN_GOOD = new Set([
  'Tingting', 'Ting-Ting', 'Meijia', 'Mei-Jia', 'Sinji', 'Sin-ji',
  'Huihui', 'Yaoyao', 'Kangkang', 'Xiaoxiao',
])

/** `Eddy (Chinese (China mainland))` → `Eddy`. */
function baseName(name: string): string {
  return name.split(' (')[0].trim()
}

function isChinese(lang: string): boolean {
  const tag = lang.toLowerCase()
  return tag.startsWith('zh') || tag.startsWith('cmn') || tag.startsWith('yue')
}

/**
 * Whether this voice speaks the language the cards are in.
 *
 * `zh-HK` is Cantonese — a different spoken language, not an accent — and the
 * old `startsWith('zh')` fallback could select it. It has to lose to every
 * Mandarin voice no matter how good it sounds, which is why this outranks
 * quality rather than tie-breaking against it.
 */
function isMandarin(lang: string): boolean {
  const tag = lang.toLowerCase()
  return !tag.startsWith('yue') && !tag.startsWith('zh-hk')
}

function tier(voice: VoiceLike): number {
  const base = baseName(voice.name)
  if (NOVELTY.has(base)) return 0
  // Remote voices are Google's neural ones. They are better than anything
  // installed locally by a wide enough margin to outrank the name list.
  if (!voice.localService) return 3
  if (KNOWN_GOOD.has(base)) return 2
  return 1
}

/** Mainland first, then Taiwan — a tie-break between voices of equal quality. */
function accent(lang: string): number {
  const tag = lang.toLowerCase()
  if (tag.startsWith('zh-cn') || tag.startsWith('zh-sg') || tag === 'zh') return 2
  if (tag.startsWith('zh-tw')) return 1
  return 0
}

function score(voice: VoiceLike): number {
  return (isMandarin(voice.lang) ? 100 : 0) + tier(voice) * 10 + accent(voice.lang)
}

/**
 * The best Chinese voice available, or null if the browser has none.
 *
 * Pure, so the whole ranking can be tested against a real `getVoices()` dump
 * without a browser. `preferred` is a voice name the user chose and wins
 * outright — but only if it is still installed and still working, since settings
 * sync across machines that do not have the same voices.
 */
export function pickVoice<T extends VoiceLike>(
  voices: readonly T[],
  preferred = '',
  unusable: ReadonlySet<string> = new Set(),
): T | null {
  const usable = voices.filter((v) => isChinese(v.lang) && !unusable.has(v.name))
  if (usable.length === 0) return null

  const chosen = preferred ? usable.find((v) => v.name === preferred) : undefined
  if (chosen) return chosen

  return usable.reduce((best, v) => (score(v) > score(best) ? v : best))
}

/** Every Chinese voice, best first — what the popup's picker lists. */
export function listVoices(): SpeechSynthesisVoice[] {
  return installed()
    .filter((v) => isChinese(v.lang))
    .sort((a, b) => score(b) - score(a))
}

/** True when this voice synthesises over the network, so the picker can say so. */
export function isRemote(voice: VoiceLike): boolean {
  return !voice.localService
}

let prefs = {
  voice: DEFAULT_SETTINGS.speechVoice,
  rate: DEFAULT_SETTINGS.speechRate,
}

/** Voices that have failed to speak this session — see the header. */
const unusable = new Set<string>()

let cached: SpeechSynthesisVoice | null = null
let listening = false

function installed(): SpeechSynthesisVoice[] {
  if (typeof speechSynthesis === 'undefined') return []
  return speechSynthesis.getVoices()
}

/**
 * Picks and memoises a voice.
 *
 * `getVoices()` is empty until the list loads on some platforms, so this
 * re-checks rather than caching a miss, and gives up gracefully — a machine with
 * no Chinese voice installed simply gets no audio button.
 */
function selected(): SpeechSynthesisVoice | null {
  if (cached) return cached

  const voices = installed()
  if (voices.length === 0) {
    if (!listening && typeof speechSynthesis !== 'undefined') {
      listening = true
      // Fires once the list is populated; nothing to do but let the next call
      // through, by which time getVoices() answers.
      speechSynthesis.addEventListener('voiceschanged', () => {
        cached = null
      })
    }
    return null
  }

  cached = pickVoice(voices, prefs.voice, unusable)
  return cached
}

export function canSpeak(): boolean {
  return selected() !== null
}

/**
 * Counts calls so a superseded utterance can drop itself.
 *
 * Needed because speaking is deferred a task (see `say`), which reopens the
 * window `cancel()` was closing — without this, clicking through several cards
 * would let every deferred utterance fire and the audio would run behind the
 * screen again.
 */
let issued = 0

export function speak(text: string): void {
  const voice = selected()
  if (!voice) return
  say(text, voice, true)
}

function say(text: string, voice: SpeechSynthesisVoice, mayRetry: boolean): void {
  // Cancel first: clicking through several cards otherwise queues them all and
  // the audio runs minutes behind the screen.
  speechSynthesis.cancel()

  const token = ++issued

  // Chrome intermittently drops — or clips the first syllable off — an utterance
  // queued in the same task as the cancel() above. On a tone language that first
  // syllable is usually the whole answer, so this waits a task.
  setTimeout(() => {
    if (token !== issued) return

    const utterance = new SpeechSynthesisUtterance(text)
    utterance.voice = voice
    utterance.lang = voice.lang
    utterance.rate = prefs.rate

    utterance.onerror = (event) => {
      // 'interrupted' and 'canceled' are the normal result of the cancel() above
      // when the next card comes fast, and mean nothing is wrong with the voice.
      if (event.error !== 'network' && event.error !== 'synthesis-unavailable') return
      if (!mayRetry) return

      unusable.add(voice.name)
      cached = null
      const fallback = selected()
      if (fallback && fallback.name !== voice.name) say(text, fallback, false)
    }

    speechSynthesis.speak(utterance)
  }, 0)
}

function apply(settings: Settings): void {
  const voice = settings.speechVoice
  // A changed choice has to drop the memo, or the old voice keeps speaking until
  // the page is reloaded.
  if (voice !== prefs.voice) cached = null
  prefs = { voice, rate: clampSpeechRate(settings.speechRate) }
}

// Read once and then follow. `canSpeak()` is called during render in three
// places and so has to stay synchronous, which it can: whether *a* Chinese voice
// exists does not depend on settings. Only the choice between them does, and
// until this resolves the defaults are the right answer anyway.
if (typeof chrome !== 'undefined' && chrome.storage) {
  void loadSettings().then(apply)
  onSettingsChanged(apply)
}
