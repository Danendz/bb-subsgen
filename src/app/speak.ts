// Audio for cards, from the voices the browser already has.
//
// No audio files and no network: pinyin and tone colours teach the *symbol* of
// a tone, never the sound, and that gap is the one thing a reader extension
// cannot close by rendering harder.

let voice: SpeechSynthesisVoice | null = null
let looked = false

/**
 * Picks a Mandarin voice.
 *
 * `getVoices()` is empty until the list loads on some platforms, so this
 * re-checks rather than caching a miss, and gives up gracefully — a machine
 * with no Chinese voice installed simply gets no audio button.
 */
function mandarinVoice(): SpeechSynthesisVoice | null {
  if (voice) return voice
  if (typeof speechSynthesis === 'undefined') return null

  const voices = speechSynthesis.getVoices()
  if (!voices.length) {
    if (!looked) {
      looked = true
      // Fires once the list is populated; nothing to do but let the next call
      // through, by which time getVoices() answers.
      speechSynthesis.addEventListener('voiceschanged', () => {
        voice = null
      })
    }
    return null
  }

  voice =
    voices.find((v) => v.lang === 'zh-CN') ??
    voices.find((v) => v.lang.startsWith('zh')) ??
    null
  return voice
}

export function canSpeak(): boolean {
  return mandarinVoice() !== null
}

export function speak(text: string): void {
  const selected = mandarinVoice()
  if (!selected) return

  // Cancel first: clicking through several cards otherwise queues them all and
  // the audio runs minutes behind the screen.
  speechSynthesis.cancel()

  const utterance = new SpeechSynthesisUtterance(text)
  utterance.voice = selected
  utterance.lang = selected.lang
  // Slightly under normal — tones are what you are listening for, and native
  // pace clips them for anyone who still needs the button.
  utterance.rate = 0.85
  speechSynthesis.speak(utterance)
}
