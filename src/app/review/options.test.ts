import { describe, expect, test } from 'vitest'
import { buildOptions, type OptionDeps } from './options'
import type { Item } from '../../flashcards/types'
import type { Entry } from '../../lang/pack'

const card = (text: string, kind: Item['kind'] = 'word'): Item => ({
  id: `${kind === 'word' ? 'w' : 's'}:zh:${text}`,
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

describe('buildOptions', () => {
  test('asks the dictionary once for the whole session, not once per card', async () => {
    // A lookup per card is a pause per card, and the point of resolving here is
    // that the session already holds everything the resolution needs.
    const d = deps(Object.fromEntries(deck.map((w, i) => [w, `gloss ${i}`])))
    await buildOptions([card('学习'), card('学生')], deck, () => undefined, d)
    expect(d.asked).toHaveLength(1)
  })

  test('a word card comes back with its own meaning among the options', async () => {
    const sets = await buildOptions(
      [card('学习')],
      deck,
      () => undefined,
      deps(Object.fromEntries(deck.map((w, i) => [w, `gloss ${i}`]))),
    )
    const choices = sets.get('w:zh:学习')!
    expect(choices).toHaveLength(4)
    expect(choices.find((c) => c.correct)!.text).toBe('gloss 0')
  })

  test('leaves sentences alone — a line is not answered by picking a word meaning', async () => {
    const sets = await buildOptions(
      [card('我很累。', 'sentence')],
      deck,
      () => undefined,
      deps({ '我很累。': 'I am tired' }),
    )
    expect(sets.size).toBe(0)
  })

  test('skips a word the dictionary cannot gloss rather than inventing an answer', async () => {
    const sets = await buildOptions([card('侬')], deck, () => undefined, deps({ 学生: 'student' }))
    expect(sets.has('w:zh:侬')).toBe(false)
  })

  test('a deck too small to fill a question borrows from the dictionary', async () => {
    // The alternative is that a first session of two cards meets a different
    // exercise from everyone else's, for a reason nothing on the screen
    // explains.
    const asked: string[] = []
    const sets = await buildOptions(
      [card('学习')],
      ['学习', '学生'],
      () => undefined,
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
      deck,
      () => undefined,
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
      deck,
      () => undefined,
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
      [...far, ...near],
      (word) => rank[word],
      deps(Object.fromEntries(['学习', ...near, ...far].map((word) => [word, `mean ${word}`]))),
    )
    const texts = sets.get('w:zh:学习')!.map((c) => c.text)
    expect(texts.some((text) => far.some((word) => text.endsWith(word)))).toBe(false)
  })
})
