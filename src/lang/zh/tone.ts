// CC-CEDICT's notation, and the machinery for reading it. Pack-internal: what
// leaves this directory is a `ReadingPart`, which carries a tone number and a
// display form and no trace of the digit either was derived from.
//
// The tone palette used to live here, and moved to `lang/reading.ts` when the
// renderers stopped parsing readings — a tone number is neutral, so the hexes
// that colour one belong where anything can reach them without importing
// Chinese.

/** CC-CEDICT syllables always end in a tone digit (1-4, 5 = neutral). */
export function parseTone(syllable: string): number {
  const match = /([1-5])$/.exec(syllable)
  return match ? Number(match[1]) : 5
}

// index 0 = toneless, 1-4 = tone marks. Neutral tone (5) uses the toneless form.
const VOWEL_MARKS: Record<string, string[]> = {
  a: ['a', 'ā', 'á', 'ǎ', 'à'],
  e: ['e', 'ē', 'é', 'ě', 'è'],
  i: ['i', 'ī', 'í', 'ǐ', 'ì'],
  o: ['o', 'ō', 'ó', 'ǒ', 'ò'],
  u: ['u', 'ū', 'ú', 'ǔ', 'ù'],
  ü: ['ü', 'ǖ', 'ǘ', 'ǚ', 'ǜ'],
}

function markPosition(lettersLower: string): number {
  if (lettersLower.includes('a')) return lettersLower.lastIndexOf('a')
  if (lettersLower.includes('e')) return lettersLower.lastIndexOf('e')
  if (lettersLower.includes('ou')) return lettersLower.indexOf('o')
  let last = -1
  for (const vowel of ['i', 'o', 'u', 'ü']) {
    const idx = lettersLower.lastIndexOf(vowel)
    if (idx > last) last = idx
  }
  return last
}

/** Converts a whole CC-CEDICT pinyin run (e.g. "xi3 huan5") to diacritics ("xǐ huan"). */
export function toDiacriticPhrase(pinyin: string, separator = ' '): string {
  if (!pinyin) return ''
  return pinyin.split(' ').map(toDiacritic).join(separator)
}

/** Converts a CC-CEDICT numeric-tone syllable (e.g. "xi3") to diacritic form (e.g. "xǐ"). */
export function toDiacritic(syllable: string): string {
  const match = /^([a-zA-Zü]+)([1-5])$/.exec(syllable)
  if (!match) return syllable
  const [, letters, toneStr] = match
  const tone = Number(toneStr)
  if (tone === 5) return letters

  const pos = markPosition(letters.toLowerCase())
  if (pos === -1) return letters

  const original = letters[pos]
  const isUpper = original === original.toUpperCase() && original.toLowerCase() !== original
  const marked = VOWEL_MARKS[original.toLowerCase()]?.[tone]
  if (!marked) return letters

  const replacement = isUpper ? marked.toUpperCase() : marked
  return letters.slice(0, pos) + replacement + letters.slice(pos + 1)
}
