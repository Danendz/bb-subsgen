import { describe, expect, test } from 'vitest'
import { deinflect } from './deinflect'

/** Whether the table offers `text` as a `cls` word — the pair the segmenter checks. */
const offers = (surface: string, text: string, cls: string): boolean =>
  deinflect(surface).some((candidate) => candidate.text === text && candidate.class === cls)

/** The forms peeled off to reach one candidate, or null if it was never offered. */
const formsFor = (surface: string, text: string, cls: string): string[] | null =>
  deinflect(surface).find((c) => c.text === text && c.class === cls)?.forms ?? null

describe('deinflect', () => {
  // The godan past is four different endings for one tense, one per consonant
  // class, and every one of them fails silently: 泳いた resolves to nothing at
  // all, which on a card is indistinguishable from a word JMdict is missing.
  test('undoes each godan past ending, which is a different ending per consonant', () => {
    expect(offers('書いた', '書く', 'v5k')).toBe(true) // 手紙を書いた
    expect(offers('泳いだ', '泳ぐ', 'v5g')).toBe(true) // 海で泳いだ
    expect(offers('飲んだ', '飲む', 'v5m')).toBe(true) // ビールを飲んだ
    expect(offers('買った', '買う', 'v5u')).toBe(true) // パンを買った
    expect(offers('話した', '話す', 'v5s')).toBe(true) // friends と話した
    expect(offers('待った', '待つ', 'v5t')).toBe(true) // 一時間待った
  })

  // 行く is the one godan verb whose te-form does not follow its ending. The
  // class is what saves it: 行つ comes back too, but only ever as a `v5t` word,
  // and there is no `v5t` headword 行つ for the lexicon to agree to.
  test('reaches 行く from 行った, and offers 行つ only as the class no verb has', () => {
    expect(offers('行った', '行く', 'v5k-s')).toBe(true)
    expect(offers('行った', '行つ', 'v5k-s')).toBe(false)
    expect(offers('行った', '行く', 'v5k')).toBe(false)
  })

  // The ambiguity commit 2 leans on. 言った is 言う and 行った is 行く, and the
  // *same* rule that produces one produces the other's spelling-mate — 行った is
  // genuinely also 行う (おこなう). Both have to survive the table so that the
  // dictionary, not rule order, is what picks.
  test('offers every reading of ～った, because only the dictionary can choose', () => {
    expect(offers('言った', '言う', 'v5u')).toBe(true)
    expect(offers('行った', '行う', 'v5u')).toBe(true)
    expect(offers('行った', '行く', 'v5k-s')).toBe(true)
  })

  // する and 来る are the two verbs no row covers. `vs` is the class JMdict puts
  // on the *noun* in 勉強する, so the headword to find is 勉強 — with the した
  // gone entirely, not turned back into する.
  test('handles する and 来る, whose stems belong to no godan row', () => {
    expect(offers('した', 'する', 'vs-i')).toBe(true)
    expect(offers('して', 'する', 'vs-i')).toBe(true)
    expect(offers('しない', 'する', 'vs-i')).toBe(true)
    expect(offers('します', 'する', 'vs-i')).toBe(true)
    expect(offers('勉強した', '勉強', 'vs')).toBe(true)
    expect(offers('きた', 'くる', 'vk')).toBe(true)
    expect(offers('来た', '来る', 'vk')).toBe(true)
    expect(offers('来ない', '来る', 'vk')).toBe(true)
  })

  test('undoes the polite forms, which is most of what a learner reads first', () => {
    expect(offers('食べます', '食べる', 'v1')).toBe(true)
    expect(offers('食べません', '食べる', 'v1')).toBe(true)
    expect(offers('飲みました', '飲む', 'v5m')).toBe(true)
    expect(offers('行きませんでした', '行く', 'v5k-s')).toBe(true)
  })

  test('undoes the te-form, which is where the sound changes bite twice', () => {
    expect(offers('食べて', '食べる', 'v1')).toBe(true)
    expect(offers('泳いで', '泳ぐ', 'v5g')).toBe(true)
    expect(offers('飲んで', '飲む', 'v5m')).toBe(true)
  })

  // 〜ている is stacked on a te-form rather than on the verb, so peeling it has
  // to hand the sound-change rules a te-form back rather than repeat them.
  test('peels 飲んでいる back through 飲んで, not around it', () => {
    expect(offers('飲んでいる', '飲む', 'v5m')).toBe(true)
    expect(offers('食べている', '食べる', 'v1')).toBe(true)
    expect(offers('食べてない', '食べる', 'v1')).toBe(true)
  })

  test('undoes the potential, which is a godan verb wearing an ichidan ending', () => {
    expect(offers('書ける', '書く', 'v5k')).toBe(true)
    expect(offers('飲めない', '飲む', 'v5m')).toBe(true)
    expect(offers('食べられる', '食べる', 'v1')).toBe(true)
  })

  test('undoes the conditional and the volitional', () => {
    expect(offers('書けば', '書く', 'v5k')).toBe(true)
    expect(offers('食べれば', '食べる', 'v1')).toBe(true)
    expect(offers('飲んだら', '飲む', 'v5m')).toBe(true)
    expect(offers('書こう', '書く', 'v5k')).toBe(true)
    expect(offers('食べよう', '食べる', 'v1')).toBe(true)
  })

  // なかった is not a rule of its own: it is な + かった, and the adjective past
  // is what turns it back into ない. Getting that wrong loses every negative
  // past in the language, which is a large fraction of ordinary narration.
  test('reads なかった as the adjective past of ない, not as a form of its own', () => {
    expect(offers('高かった', '高い', 'adj-i')).toBe(true)
    expect(offers('高くない', '高い', 'adj-i')).toBe(true)
    expect(offers('食べなかった', '食べる', 'v1')).toBe(true)
    expect(offers('行かなかった', '行く', 'v5k-s')).toBe(true)
  })

  // A causative-passive negative past is one word to a reader, and five rules
  // to the table. This is the case that says the walk chains rather than taking
  // one step and stopping.
  test('peels 食べさせられなかった back to 食べる — five suffixes are one word', () => {
    expect(offers('食べさせられなかった', '食べる', 'v1')).toBe(true)
    expect(formsFor('食べさせられなかった', '食べる', 'v1')).toEqual([
      'past',
      'negative',
      'passive',
      'causative',
    ])
  })

  // The deepest form MAX_DEINFLECTIONS was set for. If the bound is ever
  // lowered this is what stops answering.
  test('reaches 使う from 使わせられたくなかった, the depth the bound was chosen for', () => {
    expect(offers('使わせられたくなかった', '使う', 'v5u')).toBe(true)
  })

  // Nothing to undo is a normal answer, not a failure — every uninflected word
  // on the page arrives here after the literal lookup missed.
  test('answers with no verb candidate for a word that is not conjugated', () => {
    expect(offers('猫', '猫', 'v1')).toBe(false)
    expect(deinflect('')).toEqual([])
  })
})
