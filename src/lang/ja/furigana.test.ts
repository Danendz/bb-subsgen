import { describe, expect, test } from 'vitest'
import { furiganaParts } from './furigana'
import type { ReadingPart } from '../pack'

const over = (base: string, text = ''): ReadingPart => ({ base, text, tone: null })

describe('furiganaParts', () => {
  // The whole point of the issue: たべる does not go over 食べる, た goes over 食.
  test('puts the reading on the kanji and leaves the okurigana carrying nothing', () => {
    expect(furiganaParts('食べる', 'たべる')).toEqual([over('食', 'た'), over('べる')])
  })

  test('cuts a compound where the kana between the kanji says it is cut', () => {
    expect(furiganaParts('食べ物', 'たべもの')).toEqual([
      over('食', 'た'),
      over('べ'),
      over('物', 'もの'),
    ])
  })

  // Two kanji, four mora, and nothing saying きの belongs to 昨. Guessing here
  // is what `readingParts` refuses to do for 不入虎穴，焉得虎子.
  test('keeps a run of kanji whole rather than guessing where to cut its reading', () => {
    expect(furiganaParts('昨日', 'きのう')).toEqual([over('昨日', 'きのう')])
  })

  test('gives a word that is all kana one bare part rather than no parts at all', () => {
    expect(furiganaParts('そして', 'そして')).toEqual([over('そして')])
    expect(furiganaParts('カタカナ', 'かたかな')).toEqual([over('カタカナ')])
  })

  // A katakana surface paired with a hiragana reading is ordinary, not a
  // failure — but the fold is for matching, and what comes back is the reading
  // as it was written.
  test('folds katakana to match, and still carries the reading as the dictionary wrote it', () => {
    expect(furiganaParts('消しゴム', 'けしごむ')).toEqual([over('消', 'け'), over('しゴム')])
    expect(furiganaParts('消しゴム', 'ケシゴム')).toEqual([over('消', 'ケ'), over('しゴム')])
  })

  // 々 is Script=Common. Left as a literal it would be a character the reading
  // has to contain, and no reading ever does — so every word written with one
  // would fail to align.
  test('annotates 々 instead of expecting it to appear in the reading', () => {
    expect(furiganaParts('時々', 'ときどき')).toEqual([over('時々', 'ときどき')])
  })

  // The failure path, and the reason it is `base: ''`: the alignment is not
  // known, which is what #8 documented that value to mean. It degrades to what
  // Chinese draws today — one run above the whole word.
  test('blanks the alignment rather than inventing one when the reading does not fit', () => {
    expect(furiganaParts('食べる', 'たべます')).toEqual([over('', 'たべます')])
  })
})
