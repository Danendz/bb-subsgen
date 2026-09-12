import { describe, expect, test } from 'vitest'
import { MATURE_INTERVAL_DAYS } from './known'
import { bandsFor, circleState, circleTone, waiting, type Circle } from './path'
import type { Item, Rank } from './types'
import type { SectionScheme } from '../lang/pack'

function make(partial: Partial<Item> & Pick<Item, 'text'>): Item {
  return {
    id: `w:zh:${partial.text}`,
    lang: 'zh',
    kind: 'word',
    state: 'new',
    interval: 0,
    ease: 2.5,
    due: 0,
    reps: 0,
    lapses: 0,
    createdAt: 0,
    contexts: [],
    ...partial,
  }
}

/** `n` ranked words named `w1`, `w2`, …, shuffled, because a store is not a list. */
function ranks(n: number, from = 1): Rank[] {
  const rows: Rank[] = []
  for (let i = 0; i < n; i++) rows.push({ lang: 'zh', headword: `w${from + i}`, rank: from + i })
  return rows.reverse()
}

const deckOf = (items: Item[]) => new Map(items.map((item) => [item.text, item]))

const circle = (words: string[]): Circle => ({ index: 0, words, from: 1, to: words.length })

/** Two small bands and a last one that has to absorb whatever is left. */
const scheme: SectionScheme = { sizes: [16, 24, 8], name: (i) => `Band ${i + 1}` }

describe('bandsFor', () => {
  test('cuts the list into eights however the store happened to hand it over', () => {
    const [section] = bandsFor(ranks(40))
    expect(section.units[0].circles.map((c) => c.words)).toEqual([
      ['w1', 'w2', 'w3', 'w4', 'w5', 'w6', 'w7', 'w8'],
      ['w9', 'w10', 'w11', 'w12', 'w13', 'w14', 'w15', 'w16'],
      ['w17', 'w18', 'w19', 'w20', 'w21', 'w22', 'w23', 'w24'],
      ['w25', 'w26', 'w27', 'w28', 'w29', 'w30', 'w31', 'w32'],
      ['w33', 'w34', 'w35', 'w36', 'w37', 'w38', 'w39', 'w40'],
    ])
  })

  test('leaves an unranked word off the path — the corpus never saw it', () => {
    const rows: Rank[] = [
      { lang: 'zh', headword: 'w1', rank: 1 },
      { lang: 'zh', headword: 'obscure' },
      { lang: 'zh', headword: 'w2', rank: 2 },
    ]
    expect(bandsFor(rows)[0].units[0].circles[0].words).toEqual(['w1', 'w2'])
  })

  test('names sections off the scheme, and lets its last band take the overflow', () => {
    const sections = bandsFor(ranks(60), scheme)
    expect(sections.map((s) => s.name)).toEqual(['Band 1', 'Band 2', 'Band 3'])
    // 16 + 24 = 40 accounted for; the remaining 20 all join the last band
    // rather than starting an unnamed fourth one.
    expect(sections[2].units.flatMap((u) => u.circles).flatMap((c) => c.words)).toHaveLength(20)
  })

  test('never lets one circle straddle two sections — a section has to say what it holds', () => {
    // 16 is two circles; 24 is three. Neither is a multiple of 40, so a global
    // word index would put circle 2 half in one band and half in the next.
    const sections = bandsFor(ranks(40), scheme)
    expect(sections[0].units[0].circles.map((c) => c.words.length)).toEqual([8, 8])
    expect(sections[1].units[0].circles.map((c) => c.words.length)).toEqual([8, 8, 8])
    expect(sections[1].units[0].circles[0].words[0]).toBe('w17')
  })

  test('falls back to plain bands for a language whose pack names no scheme', () => {
    const sections = bandsFor(ranks(500))
    expect(sections).toHaveLength(3)
    expect(sections[0].name).toBeUndefined()
    expect(sections[0].units).toHaveLength(5)
  })

  test('numbers circles across the whole path, so one number can address any of them', () => {
    const sections = bandsFor(ranks(60), scheme)
    const all = sections.flatMap((s) => s.units.flatMap((u) => u.circles))
    expect(all.map((c) => c.index)).toEqual([...all.keys()])
  })
})

describe('circleState', () => {
  const words = ['w1', 'w2', 'w3', 'w4']

  test('a locked circle says how near it is and which words are still missing', () => {
    const state = circleState(circle(words), deckOf([make({ text: 'w1' }), make({ text: 'w3' })]))
    expect(state).toEqual({ status: 'locked', met: 2, missing: ['w2', 'w4'] })
  })

  test('is ready while any of its words has never been taught', () => {
    const deck = deckOf([
      make({ text: 'w1', introducedAt: 1 }),
      make({ text: 'w2', introducedAt: 1 }),
      make({ text: 'w3', introducedAt: 1 }),
      make({ text: 'w4' }),
    ])
    expect(circleState(circle(words), deck).status).toBe('ready')
  })

  test('is taken in once every word has been answered, not merely collected', () => {
    const deck = deckOf(words.map((text) => make({ text, introducedAt: 1 })))
    expect(circleState(circle(words), deck).status).toBe('taken')
  })

  test('masters on the same threshold that stops the overlay annotating a word', () => {
    const mature = (text: string, interval: number) =>
      make({ text, state: 'review', interval, introducedAt: 1 })

    const short = words.map((text, i) =>
      mature(text, i === 0 ? MATURE_INTERVAL_DAYS - 1 : MATURE_INTERVAL_DAYS),
    )
    expect(circleState(circle(words), deckOf(short)).status).toBe('taken')

    const all = words.map((text) => mature(text, MATURE_INTERVAL_DAYS))
    expect(circleState(circle(words), deckOf(all)).status).toBe('mastered')
  })

  test('counts a word you declared you already know as mastered', () => {
    const deck = deckOf(words.map((text) => make({ text, state: 'known', introducedAt: 1 })))
    expect(circleState(circle(words), deck).status).toBe('mastered')
  })
})

describe('waiting', () => {
  const sections = bandsFor(ranks(40))

  test('finds the circle nearest to opening, not the one nearest the start', () => {
    // Everything of circle 3 except one word, and two words of circle 0. Video
    // does not deal out ranks evenly, so the circle you are one word short of
    // is very often not the next one on the path.
    const deck = deckOf(
      ['w1', 'w2', 'w17', 'w18', 'w19', 'w20', 'w21', 'w22', 'w23'].map((text) => make({ text })),
    )
    const { next, words } = waiting(sections, deck)
    expect(next?.circle.index).toBe(2)
    expect(next?.state.met).toBe(7)
    expect(next?.state.missing).toEqual(['w24'])
    expect(words).toHaveLength(9)
  })

  test('ignores a circle you have met nothing of — that is next, not near', () => {
    expect(waiting(sections, deckOf([])).next).toBeUndefined()
  })

  test('leaves an unlocked circle out of what is waiting — it is not waiting for anything', () => {
    const deck = deckOf(
      ['w1', 'w2', 'w3', 'w4', 'w5', 'w6', 'w7', 'w8', 'w9'].map((text) => make({ text })),
    )
    const { words, next } = waiting(sections, deck)
    expect(words).toEqual(['w9'])
    expect(next?.circle.index).toBe(1)
  })
})

describe('circleTone', () => {
  const tones: Record<string, number> = { a: 1, b: 1, c: 3, d: 3, e: 2 }
  const toneOf = (word: string) => tones[word] ?? null

  test('tints a circle with the tone most of it is said in', () => {
    expect(circleTone(['a', 'b', 'c'], toneOf)).toBe(1)
  })

  test('breaks a tie on the lower tone, so the answer never depends on map order', () => {
    expect(circleTone(['c', 'e'], toneOf)).toBe(2)
    expect(circleTone(['e', 'c'], toneOf)).toBe(2)
  })

  test('answers nothing for a language that marks no tone', () => {
    expect(circleTone(['a', 'b'], () => null)).toBeNull()
  })
})
