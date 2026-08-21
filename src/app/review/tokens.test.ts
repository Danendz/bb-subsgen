import { describe, expect, test } from 'vitest'
import { lineTokens } from './tokens'
import { chinesePack } from '../../lang/zh/pack'

/** Enough of a word list to segment the lines below the way the app would. */
const WORDS = chinesePack.load(
  [
    '南昌\tnan2 chang1',
    '真的\tzhen1 de5',
    '太\ttai4',
    '恐怖\tkong3 bu4',
    '了\tle5',
    '好\thao3',
    '好好\thao3 hao3',
    '学习\txue2 xi2',
  ].join('\n'),
)

const LINE = '南昌真的太恐怖了。'

const WORDS_WITH_PARTICLE = chinesePack.load('我\two3\n的\tde5\n书\tshu1')

const texts = (tokens: ReturnType<typeof lineTokens>) => tokens.map((t) => t.text)
const reading = (tokens: ReturnType<typeof lineTokens>) =>
  tokens.filter((t) => t.reading).map((t) => t.text)

describe('lineTokens', () => {
  test('splits the line into the words the deck knows about', () => {
    const tokens = lineTokens(LINE, WORDS, { known: new Set() })
    expect(texts(tokens)).toEqual(['南昌', '真的', '太', '恐怖', '了', '。'])
  })

  test('marks punctuation as inert, so nothing offers to define it', () => {
    const tokens = lineTokens(LINE, WORDS, { known: new Set() })
    expect(tokens.find((t) => t.text === '。')?.han).toBe(false)
    expect(tokens.find((t) => t.text === '恐怖')?.han).toBe(true)
  })

  describe('readings', () => {
    test('are off unless asked for, because a question volunteers nothing', () => {
      expect(reading(lineTokens(LINE, WORDS, { known: new Set() }))).toEqual([])
    })

    test('cover the words you cannot yet read, and only those', () => {
      // The same rule the video overlay follows: what stays annotated is
      // exactly what you could not read on your own.
      const known = new Set(['南昌', '太', '了'])
      expect(reading(lineTokens(LINE, WORDS, { known, readings: true }))).toEqual(['真的', '恐怖'])
    })

    test('never land on punctuation', () => {
      const tokens = lineTokens(LINE, WORDS, { known: new Set(), readings: true })
      expect(tokens.find((t) => t.text === '。')?.reading).toBe(false)
    })

    test('carry the pinyin the segmenter already found', () => {
      const tokens = lineTokens(LINE, WORDS, { known: new Set(), readings: true })
      expect(tokens.find((t) => t.text === '恐怖')?.pinyin).toBe('kong3 bu4')
    })
  })

  describe('the marked word', () => {
    test('picks the card’s own word out of its example', () => {
      const tokens = lineTokens(LINE, WORDS, { known: new Set(), mark: '恐怖' })
      expect(tokens.filter((t) => t.marked).map((t) => t.text)).toEqual(['恐怖'])
    })

    test('marks every occurrence — one of two would read as a bug', () => {
      const tokens = lineTokens('好学习好', WORDS, { known: new Set(), mark: '好' })
      expect(tokens.filter((t) => t.marked)).toHaveLength(2)
    })

    test('a word the line does not contain simply marks nothing', () => {
      // Contexts are captured from lines containing the word, so this should not
      // happen; a word list changed since capture is where it could.
      const tokens = lineTokens(LINE, WORDS, { known: new Set(), mark: '朋友' })
      expect(tokens.some((t) => t.marked)).toBe(false)
    })
  })

  describe('the blank', () => {
    test('replaces the word the card is asking for', () => {
      const tokens = lineTokens(LINE, WORDS, { known: new Set(), blank: '恐怖' })
      expect(tokens.filter((t) => t.blanked).map((t) => t.text)).toEqual(['恐怖'])
    })

    test('takes only the first occurrence', () => {
      // Blanking both would make the card a harder question than the one it was
      // scheduled as.
      const tokens = lineTokens('好学习好', WORDS, { known: new Set(), blank: '好' })
      expect(tokens.filter((t) => t.blanked)).toHaveLength(1)
      expect(tokens[0].blanked).toBe(true)
    })

    test('never carries a reading, which would be the answer', () => {
      const tokens = lineTokens(LINE, WORDS, { known: new Set(), readings: true, blank: '恐怖' })
      expect(tokens.find((t) => t.blanked)?.reading).toBe(false)
    })

    test('is not also marked, so a gap cannot be highlighted', () => {
      const tokens = lineTokens(LINE, WORDS, { known: new Set(), mark: '恐怖', blank: '恐怖' })
      expect(tokens.find((t) => t.blanked)?.marked).toBe(false)
    })
  })
})

describe('marking structure', () => {
  test('flags function words so the study app can dim them like the overlay', () => {
    const tokens = lineTokens('我的书', WORDS_WITH_PARTICLE, { known: new Set() })
    const structural = tokens.filter((t) => t.structural).map((t) => t.text)
    expect(structural).toEqual(['我', '的'])
  })

  test('does not flag ordinary vocabulary or punctuation', () => {
    const tokens = lineTokens(LINE, WORDS, { known: new Set() })
    expect(tokens.find((t) => t.text === '恐怖')?.structural).toBe(false)
    expect(tokens.find((t) => t.text === '。')?.structural).toBe(false)
  })
})
