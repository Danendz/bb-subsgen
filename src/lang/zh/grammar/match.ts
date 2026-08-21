// Finding the structures a line is built out of.
//
// There is no part-of-speech tagger here and the design does not want one. Every
// rule is anchored on a character that does grammatical work — 得, 把, 被, 了 —
// and then asks only questions that can be answered from what is already known:
// what the anchor's reading is, whether its neighbours are in the closed class,
// and where the clause ends. That is enough for the patterns worth explaining,
// and it fails by finding nothing rather than by inventing something.

import type { Token } from '../segment'
import { functionWord, isNominal, type PartOfSpeech } from './function-words'
import { PATTERNS, type Pattern } from './patterns'

/** One token's worth of requirement. */
export type Slot =
  /** A word carrying meaning of its own — anything outside the closed class. */
  | 'content'
  /**
   * A word that could head a clause — anything that is not a name or a joiner.
   *
   * Wider than `content` on purpose: 过 in 时间过得很快 is the main verb but is
   * in the function-word table as the experience marker, so requiring a content
   * word before 得 would miss the commonest complement there is.
   */
  | 'verbal'
  /** Any word at all, but not punctuation. */
  | 'any'
  /** Exactly this word. */
  | { text: string }
  /** Any function word of this class. */
  | { pos: PartOfSpeech }

export interface Rule {
  /** The character the pattern is built around. A list means any one of them. */
  anchor: string | readonly string[]
  /** Required reading of the anchor — what separates 得 `de5` from 得 `dei3`. */
  reading?: string
  /** Tokens immediately before the anchor, left to right. */
  before?: readonly Slot[]
  /** Tokens immediately after the anchor, left to right. */
  after?: readonly Slot[]
  /** Words the anchor must not be followed by. */
  notAfter?: readonly string[]
  /** The anchor is the last word of the sentence, punctuation aside. */
  atEnd?: boolean
  /** Words that must appear somewhere before the anchor — the 虽然…但是 shape. */
  requires?: readonly string[]
  /** Whether the pattern covers the rest of the clause or only its own slots. */
  extent?: 'clause'
}

export interface PatternMatch {
  pattern: Pattern
  /** First token index the pattern covers. */
  from: number
  /** Last token index the pattern covers, inclusive. */
  to: number
}

/** Particles that close a sentence rather than belonging to the clause. */
const FINAL_PARTICLES = new Set(['吗', '呢', '吧', '啊', '呀', '嘛'])

function isWord(token: Token | undefined): token is Token {
  return Boolean(token && token.pinyin !== null)
}

function isContent(token: Token | undefined): boolean {
  return isWord(token) && !functionWord(token.text)
}

function fits(token: Token | undefined, slot: Slot): boolean {
  if (!isWord(token)) return false
  if (slot === 'any') return true
  if (slot === 'content') return isContent(token)
  if (slot === 'verbal') return !isNominal(token.text)
  if ('text' in slot) return token.text === slot.text
  return functionWord(token.text)?.pos === slot.pos
}

/**
 * The last token of the clause the anchor sits in.
 *
 * Sentence-final particles are excluded deliberately: 啊 in 过得很快啊 is not
 * part of the complement, it is commentary on the whole sentence, and drawing
 * the complement's span across it would say something false about where the
 * structure ends.
 */
function clauseEnd(tokens: Token[], from: number): number {
  let end = from
  for (let i = from; i < tokens.length; i++) {
    const token = tokens[i]
    if (!isWord(token)) break
    if (FINAL_PARTICLES.has(token.text)) break
    end = i
  }
  return end
}

function anchors(rule: Rule): readonly string[] {
  return typeof rule.anchor === 'string' ? [rule.anchor] : rule.anchor
}

/** The last word index in the sentence, ignoring trailing punctuation. */
function lastWordIndex(tokens: Token[]): number {
  for (let i = tokens.length - 1; i >= 0; i--) {
    if (isWord(tokens[i])) return i
  }
  return -1
}

interface Span {
  from: number
  to: number
}

function matchAt(tokens: Token[], at: number, rule: Rule): Span | null {
  const token = tokens[at]
  if (!anchors(rule).includes(token.text)) return null
  if (rule.reading && token.pinyin !== rule.reading) return null

  const before = rule.before ?? []
  const after = rule.after ?? []

  const start = at - before.length
  if (start < 0) return null
  for (let i = 0; i < before.length; i++) {
    if (!fits(tokens[start + i], before[i])) return null
  }
  for (let i = 0; i < after.length; i++) {
    if (!fits(tokens[at + 1 + i], after[i])) return null
  }

  if (rule.notAfter?.includes(tokens[at + 1]?.text)) return null
  if (rule.atEnd && lastWordIndex(tokens) !== at) return null

  let from = start
  if (rule.requires) {
    const heads = rule.requires.map((word) => tokens.findIndex((t) => t.text === word))
    if (heads.some((i) => i === -1 || i >= at)) return null
    from = Math.min(from, ...heads)
  }

  const to = rule.extent === 'clause' ? clauseEnd(tokens, at) : at + after.length
  return { from, to }
}

/**
 * Every pattern the line contains, ordered by where it starts.
 *
 * A token can belong to more than one pattern — 了 closing 他被老师批评了 is both
 * the passive's clause end and a change of state — and both are worth saying, so
 * matches are not deduplicated against each other.
 */
export function findPatterns(tokens: Token[]): PatternMatch[] {
  const matches: PatternMatch[] = []

  for (const pattern of PATTERNS) {
    for (let at = 0; at < tokens.length; at++) {
      const span = matchAt(tokens, at, pattern.rule)
      if (span) matches.push({ pattern, from: span.from, to: span.to })
    }
  }

  return matches.sort((a, b) => a.from - b.from || a.to - b.to)
}

/**
 * The patterns a single word takes part in — what the hover card explains.
 *
 * Membership is by span, not by anchor, so hovering 过 in 过得很快 explains the
 * complement rather than nothing. That is the case worth getting right: the
 * anchor is the character you would think to look up only once you already know
 * what it does, and the whole problem is that you don't.
 *
 * Matched by text rather than by index because the caller has a DOM element, not
 * a position. A word repeated in one line therefore collects the patterns of
 * both occurrences, which reads as slightly generous rather than as wrong.
 */
export function patternsForWord(tokens: Token[], word: string): Pattern[] {
  const positions = tokens.flatMap((token, i) => (token.text === word ? [i] : []))
  if (!positions.length) return []

  const seen = new Set<string>()
  const patterns: Pattern[] = []
  for (const { pattern, from, to } of findPatterns(tokens)) {
    if (seen.has(pattern.id)) continue
    if (!positions.some((i) => i >= from && i <= to)) continue
    seen.add(pattern.id)
    patterns.push(pattern)
  }
  return patterns
}
