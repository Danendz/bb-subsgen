import type { Token } from '../pack'
import type { WordIndex } from './lexicon'
import { isFunctionWord } from './grammar/function-words'
import { applyReadingRules } from './reading'

const wordSegmenter = new Intl.Segmenter('zh', { granularity: 'word' })

export function isHan(char: string): boolean {
  return /\p{Script=Han}/u.test(char)
}

/**
 * Longest headword the search will consider.
 *
 * CC-CEDICT carries whole proverbs, and without a bound every position would
 * scan the rest of the line. Nothing shorter than a proverb loses by this, and
 * proverbs are mostly flagged as phrases anyway.
 */
const MAX_WORD = 12

// Lower is better. The numbers matter only relative to each other: a word costs
// one, and a leftover character costs more than a word, so the parse that
// explains the most characters as words wins.
const WORD = 1
const FUNCTION_CHAR = 1
const CONTENT_CHAR = 2.5
const UNKNOWN_CHAR = 4
const PARTICLE_LED = 2

/**
 * Neutral-tone readings of the structural particles.
 *
 * A particle attaches to what came before it, so a headword that *starts* with
 * one is nearly always a span the cutter should not take. The reading is what
 * makes this safe to say: 得很 is `de5 hen3` and is a mis-cut in 过得很快, while
 * 得到 is `de2 dao4`, 地方 is `di4 fang1` and 了解 is `liao3 jie3` — same
 * characters, different job, and CC-CEDICT already knows which is which.
 */
const PARTICLE_READINGS = new Set(['de5', 'le5', 'zhe5', 'guo5'])

function startsWithParticle(pinyin: string | undefined): boolean {
  if (!pinyin) return false
  return PARTICLE_READINGS.has(pinyin.split(' ')[0])
}

/**
 * What it costs to explain this span as one token.
 *
 * The whole design is in the gap between `FUNCTION_CHAR` and `CONTENT_CHAR`.
 * Chinese strands function characters constantly — 的, 了, 是 stand alone in
 * almost every sentence — but a lone *content* character is usually the
 * wreckage of a bad cut. Charging for one and not the other is what lets
 * 那时间 come apart as 那 + 时间 rather than 那时 + 间: both parses spend one
 * word and one character, but only one of them strands 间.
 */
function costOf(candidate: string, pinyin: string | undefined): number {
  if (candidate.length > 1) return startsWithParticle(pinyin) ? WORD + PARTICLE_LED : WORD
  if (isFunctionWord(candidate)) return FUNCTION_CHAR
  return pinyin !== undefined ? CONTENT_CHAR : UNKNOWN_CHAR
}

/**
 * Cuts a run of Han characters into the cheapest sequence of tokens.
 *
 * Replaces greedy longest-match, which committed to the first long word it saw
 * and could not reconsider — it took 那时 out of 那时间 and left 间 with nothing
 * to join. This scores whole parses instead, so a long word that wrecks the
 * remainder loses to two words that don't.
 */
function cheapestParse(run: string, index: WordIndex): Token[] {
  const { words, phrases } = index
  // best[i] — cost of the cheapest parse of run[0..i). take[i] — the length of
  // the token that parse ends with, which is what the walk back reads.
  const best = new Array<number>(run.length + 1).fill(Infinity)
  const take = new Array<number>(run.length + 1).fill(1)
  best[0] = 0

  for (let end = 1; end <= run.length; end++) {
    // Longest first, so an equally-priced longer word wins the tie.
    for (let len = Math.min(MAX_WORD, end); len >= 1; len--) {
      const start = end - len
      if (best[start] === Infinity) continue
      const candidate = run.slice(start, end)
      const pinyin = words.get(candidate)
      // Multi-character spans have to be real words. Single characters are
      // always allowed — something has to be able to explain every character.
      if (len > 1 && (pinyin === undefined || phrases.has(candidate))) continue

      const cost = best[start] + costOf(candidate, pinyin)
      if (cost < best[end]) {
        best[end] = cost
        take[end] = len
      }
    }
  }

  const tokens: Token[] = []
  for (let end = run.length; end > 0; end -= take[end]) {
    const text = run.slice(end - take[end], end)
    tokens.push({ text, pinyin: words.get(text) ?? null })
  }
  return tokens.reverse()
}

export function segment(text: string, index: WordIndex): Token[] {
  const baseSegments = Array.from(wordSegmenter.segment(text))

  const tokens: Token[] = []
  let hanziRun = ''

  const flushHanziRun = () => {
    if (hanziRun) {
      tokens.push(...cheapestParse(hanziRun, index))
      hanziRun = ''
    }
  }

  for (const { segment: piece } of baseSegments) {
    if (isHan(piece[0])) {
      hanziRun += piece
    } else {
      flushHanziRun()
      tokens.push({ text: piece, pinyin: null })
    }
  }
  flushHanziRun()

  // Applied here rather than left to callers. The reading is the strongest
  // signal `rankEntries` has, so a token handed out with the wrong one picks the
  // wrong gloss too — that is how 啊 came to be "interjection of surprise" at
  // the end of a sentence where it is only softening the tone.
  return applyReadingRules(tokens)
}
