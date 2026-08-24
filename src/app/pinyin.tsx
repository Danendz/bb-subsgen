// Tone as the app's colour, not as decoration.
//
// The overlay already colours subtitle pinyin by tone (`showToneColors`), and
// the study app has been quietly using three of the same five hexes for its
// verdicts and links without ever saying so. These helpers make that deliberate:
// the palette in style.css is the tone palette, and anything showing pinyin
// shows it in the tone's own colour.

import type { Lexicon, ReadingPart } from '../lang/pack'

/**
 * A reading, one span per part, coloured by its tone.
 *
 * The colour comes from a class rather than an inline style so it stays inside
 * the token layer and follows the theme. A part with no tone — kana, or a
 * reading carried over from the DOM — gets the neutral class, which is what
 * `t5` already meant.
 */
export function Pinyin({ parts }: { parts: readonly ReadingPart[] }) {
  if (!parts.length) return null
  return (
    <span class="pinyin">
      {parts.map((part, i) => (
        <span key={i} class={`syl t${part.tone ?? 5}`}>
          {part.text}
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
export function dominantTone(text: string, lexicon: Lexicon): number {
  for (const token of lexicon.segment(text)) {
    for (const part of token.reading ?? []) {
      if (part.tone !== null) return part.tone
    }
  }
  return 5
}
