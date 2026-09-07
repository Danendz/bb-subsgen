import { describe, expect, test } from 'vitest'
import { buildOptions, type OptionDeps, type OptionSources } from './options'
import type { Context, Item } from '../../flashcards/types'
import type { Entry, Pattern } from '../../lang/pack'

const PREFIX = { word: 'w', sentence: 's', grammar: 'g' } as const

const card = (text: string, kind: Item['kind'] = 'word', extra: Partial<Item> = {}): Item => ({
  id: `${PREFIX[kind]}:zh:${text}`,
  lang: 'zh',
  kind,
  text,
  state: 'new',
  interval: 0,
  ease: 2.5,
  due: 0,
  reps: 0,
  lapses: 0,
  createdAt: 0,
  contexts: [],
  ...extra,
})

/** A line and what it was captured as meaning, which is all a sentence option is. */
const line = (text: string, translation: string, extra: Partial<Context> = {}): Item =>
  card(text, 'sentence', { contexts: [{ text, translation, at: 0, ...extra }] })

const pattern = (id: string, explanation: string, hsk: number): Pattern => ({
  id,
  name: id,
  skeleton: id,
  explanation,
  hsk,
  example: '',
})

/**
 * The dictionary as a headword→gloss table, which is all this module asks of
 * one. `entries` is only ever passed back through `glossOf`, so the fake can
 * carry the gloss itself rather than a whole `Entry`.
 */
function deps(
  glosses: Record<string, string>,
  overrides: Partial<OptionDeps> = {},
): OptionDeps & { asked: string[][] } {
  const asked: string[][] = []
  return {
    asked,
    defs: async (headwords) => {
      asked.push(headwords)
      return Object.fromEntries(headwords.map((word) => [word, [] as Entry[]]))
    },
    glossOf: (_entries, headword) => glosses[headword] ?? '',
    padding: () => [],
    translate: async () => ({}),
    ...overrides,
  }
}

const deck = ['学习', '学生', '学校', '老师', '朋友', '医生', '工作']

function sources(items: Item[], overrides: Partial<OptionSources> = {}): OptionSources {
  return { deck: items, patterns: [], rankOf: () => undefined, ...overrides }
}

const words = (headwords: string[] = deck) => sources(headwords.map((word) => card(word)))

describe('buildOptions: word cards', () => {
  test('asks the dictionary once for the whole session, not once per card', async () => {
    // A lookup per card is a pause per card, and the point of resolving here is
    // that the session already holds everything the resolution needs.
    const d = deps(Object.fromEntries(deck.map((w, i) => [w, `gloss ${i}`])))
    await buildOptions([card('学习'), card('学生')], words(), d)
    expect(d.asked).toHaveLength(1)
  })

  test('a word card comes back with its own meaning among the options', async () => {
    const sets = await buildOptions(
      [card('学习')],
      words(),
      deps(Object.fromEntries(deck.map((w, i) => [w, `gloss ${i}`]))),
    )
    const choices = sets.get('w:zh:学习')!
    expect(choices).toHaveLength(4)
    expect(choices.find((c) => c.correct)!.text).toBe('gloss 0')
  })

  test('skips a word the dictionary cannot gloss rather than inventing an answer', async () => {
    const sets = await buildOptions([card('侬')], words(), deps({ 学生: 'student' }))
    expect(sets.has('w:zh:侬')).toBe(false)
  })

  test('a deck too small to fill a question borrows from the dictionary', async () => {
    // The alternative is that a first session of two cards meets a different
    // exercise from everyone else's, for a reason nothing on the screen
    // explains.
    const asked: string[] = []
    const sets = await buildOptions(
      [card('学习')],
      words(['学习', '学生']),
      deps(
        { 学习: 'to study', 学生: 'student', 学校: 'school', 学期: 'term', 学者: 'scholar' },
        {
          padding: (headword, _exclude, count) => {
            asked.push(headword)
            return ['学校', '学期', '学者', '学费'].slice(0, count)
          },
        },
      ),
    )
    expect(asked).toEqual(['学习'])
    expect(sets.get('w:zh:学习')).toHaveLength(4)
  })

  test('every option is in the reading language, or every option is in English', async () => {
    // English is the fallback, not a loading state. One option left in English
    // beside three in Spanish is the option everybody picks, whether or not
    // they know the word.
    const glosses = Object.fromEntries(deck.map((w, i) => [w, `gloss ${i}`]))
    const sets = await buildOptions(
      [card('学习')],
      words(),
      deps(glosses, {
        // The translator answered for everything except one distractor.
        translate: async (requests) =>
          Object.fromEntries(
            requests
              .filter((r) => r.headword !== '学生')
              .map((r) => [r.headword, [`es ${r.senses[0]}`]]),
          ),
      }),
    )
    const texts = sets.get('w:zh:学习')!.map((c) => c.text)
    expect(texts.every((text) => !text.startsWith('es '))).toBe(true)
  })

  test('translates the whole set once every word in it has an answer', async () => {
    const glosses = Object.fromEntries(deck.map((w, i) => [w, `gloss ${i}`]))
    const sets = await buildOptions(
      [card('学习')],
      words(),
      deps(glosses, {
        translate: async (requests) =>
          Object.fromEntries(requests.map((r) => [r.headword, [`es ${r.senses[0]}`]])),
      }),
    )
    const texts = sets.get('w:zh:学习')!.map((c) => c.text)
    expect(texts.every((text) => text.startsWith('es '))).toBe(true)
  })

  test('draws the wrong answers from the words ranked nearest, when a list says so', async () => {
    // The near words crowd the far ones out entirely. A distractor from the
    // other end of the frequency list is answered by having seen it before,
    // which is not the question the card is asking.
    const near = ['学生', '学校', '老师', '朋友', '医生', '工作']
    const far = ['鹦鹉', '瀑布', '铁匠']
    const rank: Record<string, number> = { 学习: 100 }
    near.forEach((word, i) => (rank[word] = 101 + i))
    far.forEach((word, i) => (rank[word] = 40000 + i))

    const sets = await buildOptions(
      [card('学习')],
      sources(
        [...far, ...near].map((word) => card(word)),
        { rankOf: (word) => rank[word] },
      ),
      deps(Object.fromEntries(['学习', ...near, ...far].map((word) => [word, `mean ${word}`]))),
    )
    const texts = sets.get('w:zh:学习')!.map((c) => c.text)
    expect(texts.some((text) => far.some((word) => text.endsWith(word)))).toBe(false)
  })
})

describe('buildOptions: sentence cards', () => {
  const lines = [
    line('我今天很累。', 'I am tired today'),
    line('他在看书。', 'He is reading'),
    line('我们明天去。', 'We are going tomorrow'),
    line('这个很贵。', 'This is expensive'),
    line('她会说中文。', 'She speaks Chinese'),
  ]

  test('a line is answered by picking what it means', async () => {
    const sets = await buildOptions([lines[0]], sources(lines), deps({}))
    const choices = sets.get('s:zh:我今天很累。')!
    expect(choices).toHaveLength(4)
    expect(choices.find((c) => c.correct)!.text).toBe('I am tired today')
  })

  test('the wrong translations are other lines from the deck, never the line itself', async () => {
    const sets = await buildOptions([lines[0]], sources(lines), deps({}))
    const wrong = sets.get('s:zh:我今天很累。')!.filter((c) => !c.correct)
    const others = lines.slice(1).map((l) => l.contexts[0].translation)
    expect(wrong.every((c) => others.includes(c.text))).toBe(true)
  })

  test('two lines in one session are not dealt the same three wrong answers', async () => {
    // Taken in deck order they would be. A set of distractors that repeats is a
    // set you learn instead of reading.
    const sets = await buildOptions(lines.slice(0, 2), sources(lines), deps({}))
    const wrongOf = (id: string) =>
      sets
        .get(id)!
        .filter((c) => !c.correct)
        .map((c) => c.text)
        .sort()
    expect(wrongOf('s:zh:我今天很累。')).not.toEqual(wrongOf('s:zh:他在看书。'))
  })

  test('a line captured without a translation has no answer to offer, so it is left out', async () => {
    const bare = line('没有翻译。', '')
    const sets = await buildOptions([bare], sources([...lines, bare]), deps({}))
    expect(sets.has(bare.id)).toBe(false)
  })

  test('never mixes languages, so the odd one out is not the answer', async () => {
    // The target is a setting and a deck outlives it, so a deck holds both the
    // lines captured before the switch and the ones healed after it. Whichever
    // group the card is in, the whole option set comes from that group.
    const spanish = line('他很高兴。', 'Está contento', { translationLang: 'es' })
    const sets = await buildOptions([spanish], sources([spanish, ...lines]), deps({}))
    // Only one Spanish line in the deck, so there is nothing to build a set
    // from — better than three English options beside one Spanish answer.
    expect(sets.has(spanish.id)).toBe(false)
  })
})

describe('buildOptions: grammar cards', () => {
  const patterns = [
    pattern('de-complement', 'says how the action goes', 3),
    pattern('de-attributive', 'describes the noun after it', 1),
    pattern('ba', 'says what was done to the thing', 3),
    pattern('bei', 'says who it was done by', 4),
    pattern('le-change', 'says the situation has changed', 2),
  ]
  const grammar = card('V + 得 + how', 'grammar', { patternId: 'de-complement' })

  test('a pattern is answered by picking what the shape does', async () => {
    const sets = await buildOptions([grammar], sources([], { patterns }), deps({}))
    const choices = sets.get(grammar.id)!
    expect(choices).toHaveLength(4)
    expect(choices.find((c) => c.correct)!.text).toBe('says how the action goes')
  })

  test('the wrong answers are other patterns, not other words', async () => {
    // What a shape does is not the kind of question a word's meaning is a
    // candidate answer to.
    const sets = await buildOptions([grammar], sources([], { patterns }), deps({}))
    const texts = sets.get(grammar.id)!.map((c) => c.text)
    expect(texts.every((text) => patterns.some((p) => p.explanation === text))).toBe(true)
  })

  test('draws them from patterns taught around the same time', async () => {
    // The structures met together are the ones actually confused with each
    // other — the argument frequency rank makes for words, made on `hsk`.
    const spread = [
      pattern('own', 'the answer', 1),
      pattern('near', 'met alongside it', 1),
      pattern('alsoNear', 'met alongside it too', 1),
      pattern('thirdNear', 'met not long after', 2),
      pattern('far', 'met years later', 6),
    ]
    const sets = await buildOptions(
      [card('shape', 'grammar', { patternId: 'own' })],
      sources([], { patterns: spread }),
      deps({}),
    )
    const texts = sets.get('g:zh:shape')!.map((c) => c.text)
    expect(texts).not.toContain('met years later')
  })

  test('a pattern the table has since dropped is left out rather than asked blank', async () => {
    const orphan = card('V + 啥 + ?', 'grammar', { patternId: 'no-longer-here' })
    const sets = await buildOptions([orphan], sources([], { patterns }), deps({}))
    expect(sets.has(orphan.id)).toBe(false)
  })

  test('a language with no pattern table asks nothing of its grammar cards', async () => {
    // Japanese ships none, and an empty table is a normal state rather than a
    // gap — see `LanguagePack.findPatterns`.
    const sets = await buildOptions([grammar], sources([]), deps({}))
    expect(sets.size).toBe(0)
  })
})
