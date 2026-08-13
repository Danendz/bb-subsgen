// Tone as the app's colour, not as decoration.
//
// The overlay already colours subtitle pinyin by tone (`showToneColors`), and
// the study app has been quietly using three of the same five hexes for its
// verdicts and links without ever saying so. These helpers make that deliberate:
// the palette in style.css is the tone palette, and anything showing pinyin
// shows it in the tone's own colour.

import { segment } from '../lang/segment'
import { parseTone, toDiacritic } from '../lang/tone'

/** CC-CEDICT writes a run as space-separated numeric syllables: `xue2 xi2`. */
function syllables(pinyin: string): string[] {
  return pinyin.trim().split(/\s+/).filter(Boolean)
}

/**
 * A pinyin run, one span per syllable, coloured by its tone.
 *
 * The colour comes from a class rather than an inline style so it stays inside
 * the token layer and follows the theme.
 */
export function Pinyin({ pinyin }: { pinyin: string }) {
  if (!pinyin.trim()) return null
  return (
    <span class="pinyin">
      {syllables(pinyin).map((syllable, i) => (
        <span key={i} class={`syl t${parseTone(syllable)}`}>
          {toDiacritic(syllable)}
        </span>
      ))}
    </span>
  )
}

/**
 * The tone a card is filed under, for the progress bar.
 *
 * The first toned syllable, not an average: the bar is a readout of what you
 * studied, and a mean of five tones is a colour that describes nothing. Falls
 * back to neutral for a line the dictionary cannot read.
 */
export function dominantTone(text: string, words: Map<string, string>): number {
  for (const token of segment(text, words)) {
    if (!token.pinyin) continue
    const [first] = syllables(token.pinyin)
    if (first) return parseTone(first)
  }
  return 5
}
