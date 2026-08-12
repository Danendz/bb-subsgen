// @vitest-environment jsdom
import { describe, expect, test } from 'vitest'
import { translationWithheld, type CueView } from './overlay'
import type { Token } from '../lang/segment'

const zh = (text: string): Token => ({ text, pinyin: 'x1' })
const other = (text: string): Token => ({ text, pinyin: null })

function view(partial: Partial<CueView> & Pick<CueView, 'tokens'>): CueView {
  return { translation: 'I am studying Chinese.', known: new Set(), quiz: false, ...partial }
}

describe('translationWithheld', () => {
  test('holds it back once every word in the line is known', () => {
    expect(
      translationWithheld(
        view({ tokens: [zh('我'), zh('很'), zh('好')], known: new Set(['我', '很', '好']) }),
      ),
    ).toBe(true)
  })

  test('shows it while any word is still unknown', () => {
    expect(
      translationWithheld(
        view({ tokens: [zh('我'), zh('憔悴')], known: new Set(['我']) }),
      ),
    ).toBe(false)
  })

  test('quiz mode holds it back regardless of what you know', () => {
    expect(translationWithheld(view({ tokens: [zh('憔悴')], quiz: true }))).toBe(true)
  })

  test('ignores punctuation when deciding', () => {
    // Otherwise a trailing 。would count as an unknown word and no line would
    // ever qualify.
    expect(
      translationWithheld(
        view({ tokens: [zh('我'), other('。'), other(' ')], known: new Set(['我']) }),
      ),
    ).toBe(true)
  })

  test('a line with no Chinese in it keeps its translation', () => {
    // An empty or Latin-only cue is not a line you have demonstrably read.
    expect(translationWithheld(view({ tokens: [other('♪')] }))).toBe(false)
    expect(translationWithheld(view({ tokens: [] }))).toBe(false)
  })

  test('an empty known set never withholds', () => {
    // The day-one case: nothing is known, so nothing is held back.
    expect(translationWithheld(view({ tokens: [zh('我'), zh('好')] }))).toBe(false)
  })
})
