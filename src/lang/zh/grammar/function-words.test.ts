import { describe, expect, test } from 'vitest'
import { FUNCTION_WORDS, functionWord, isFunctionWord } from './function-words'

describe('functionWord', () => {
  test('knows the particles that hold a sentence together', () => {
    expect(functionWord('的')?.pos).toBe('particle')
    expect(functionWord('得')?.pos).toBe('particle')
    expect(functionWord('啊')?.pos).toBe('particle')
  })

  test('does not claim ordinary vocabulary', () => {
    expect(isFunctionWord('时间')).toBe(false)
    expect(isFunctionWord('快')).toBe(false)
    expect(isFunctionWord('学习')).toBe(false)
  })
})

describe('declared readings', () => {
  // Ranking CC-CEDICT by sense count finds the right reading for content
  // characters — 说 is `shuo1`, not `shui4` — but function characters are the
  // exact inverse: their grammatical reading is the commonest one on screen and
  // the thinnest one in the dictionary. 了 as `le5` carries three senses against
  // `liao3`'s four, and 那 as `na4` loses outright to an archaic `nuo2`.
  //
  // So these are declared, not inferred. The table is the authority.
  test('pins the grammatical reading for particles that ranking gets wrong', () => {
    expect(functionWord('了')?.reading).toBe('le5')
    expect(functionWord('那')?.reading).toBe('na4')
    expect(functionWord('啊')?.reading).toBe('a5')
    expect(functionWord('得')?.reading).toBe('de5')
    expect(functionWord('的')?.reading).toBe('de5')
    expect(functionWord('着')?.reading).toBe('zhe5')
  })

  // 过 is the counter-example that keeps the rule honest. It is in the table as
  // the experience marker (`guo5`), but standing alone in 时间过得很快 it is the
  // ordinary verb "to pass". The declared reading is what the character reads as
  // by default, not what its grammatical job would suggest.
  test('declares the default reading, not the grammatical one, where they differ', () => {
    expect(functionWord('过')?.reading).toBe('guo4')
  })

  test('every declared reading is a single toned syllable run', () => {
    for (const entry of FUNCTION_WORDS) {
      if (!entry.reading) continue
      expect(entry.reading, `${entry.word} has a malformed reading`).toMatch(
        /^[a-zü]+[1-5](?: [a-zü]+[1-5])*$/,
      )
    }
  })

  test('every single-character function word declares its reading', () => {
    const missing = FUNCTION_WORDS.filter((e) => e.word.length === 1 && !e.reading).map(
      (e) => e.word,
    )
    expect(missing).toEqual([])
  })
})
