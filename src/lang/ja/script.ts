// Which script a Japanese character is written in — the smallest classification
// furigana alignment needs, kept out of `furigana.ts` because #14's segmenter
// asks the same questions. The reading-splitting logic was written three times
// before #8 for want of one place to put predicates like these.

/**
 * Hiragana, katakana, and the prolonged sound mark.
 *
 * `ー` is `Script=Common`, not `Script=Katakana`, so it has to be named: it is
 * said, never annotated, and a matcher that treated it as annotation-needing
 * would try to find a reading for it in ラーメン.
 */
export function isKana(char: string): boolean {
  return /[\p{Script=Hiragana}\p{Script=Katakana}ー]/u.test(char)
}

/**
 * Repetition and abbreviation marks that take a reading of their own.
 *
 * `々` is the one that matters: 時々 reads ときどき, and the mark is where どき
 * is said. Classified by script it is `Common`, so without this it would be
 * treated as a literal the reading has to contain — and it never is, so every
 * word written with one would fail to align. `ヶ` is here despite being
 * katakana by script, because in 一ヶ月 it reads か and is annotated like a
 * kanji rather than read as the sound of the character.
 */
const ANNOTATED_MARKS = '々〆ヶ'

/** Whether furigana is drawn over this character at all. */
export function needsFurigana(char: string): boolean {
  return ANNOTATED_MARKS.includes(char) || /\p{Script=Han}/u.test(char)
}

// Hiragana sits 0x60 below its katakana counterpart, for the whole of
// ァ-ヶ. The marks past ヶ (ヷ-ヺ, the iteration marks) have no hiragana form
// and are left as they are.
const KATAKANA_START = 0x30a1
const KATAKANA_END = 0x30f6
const KANA_OFFSET = 0x60

/**
 * Katakana folded to hiragana, **for matching only**.
 *
 * A katakana surface is routinely paired with a hiragana reading, and the two
 * are the same sounds written twice. Nothing stored goes through this: the
 * parts carry the reading as the dictionary wrote it.
 */
export function toHiragana(text: string): string {
  return Array.from(text)
    .map((char) => {
      const code = char.codePointAt(0) as number
      return code >= KATAKANA_START && code <= KATAKANA_END
        ? String.fromCodePoint(code - KANA_OFFSET)
        : char
    })
    .join('')
}
