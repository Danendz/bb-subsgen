// The conventional MDBG tone→color mapping, softened to light pastels so the
// pinyin stays legible over video instead of reading as neon.
const TONE_COLORS: Record<number, string> = {
  1: '#ff8a8a', // coral
  2: '#ffc46b', // amber
  3: '#7ee0a8', // mint
  4: '#8ab6ff', // sky
  5: '#c3c8d0', // soft gray (neutral)
}

/** CC-CEDICT syllables always end in a tone digit (1-4, 5 = neutral). */
export function parseTone(syllable: string): number {
  const match = /([1-5])$/.exec(syllable)
  return match ? Number(match[1]) : 5
}

/** MDBG standard tone-coloring convention. */
export function toneColor(tone: number): string {
  return TONE_COLORS[tone] ?? TONE_COLORS[5]
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
