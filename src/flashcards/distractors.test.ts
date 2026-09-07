import { describe, expect, test } from 'vitest'
import { nearestByRank, nearestToAny } from './distractors'

/** A frequency list as `rankOf` sees one: known words numbered, everything else absent. */
const ranks = (entries: Record<string, number>) => (word: string) => entries[word]

describe('nearestByRank', () => {
  test('offers the words the learner is meeting alongside this one', () => {
    // The point of the whole module: 学校 against 学生 is a question about
    // knowing 学习, where 学习 against a word from another year is a question
    // about which one you have seen before.
    const rankOf = ranks({ 学习: 100, 学生: 105, 学校: 95, 鹦鹉: 40000, 的: 1 })
    expect(nearestByRank('学习', ['的', '鹦鹉', '学生', '学校'], rankOf, 2)).toEqual([
      '学校',
      '学生',
    ])
  })

  test('never offers the word as its own distractor, which would make two options right', () => {
    const rankOf = ranks({ 学习: 100, 学生: 105 })
    expect(nearestByRank('学习', ['学习', '学生'], rankOf, 3)).toEqual(['学生'])
  })

  test('keeps the deck order when no list is installed, rather than refusing to answer', () => {
    // Frequency lists are uploaded, not shipped, so a deck with no ranks at all
    // is the state most learners start in — and a deck word is still a better
    // distractor than nothing.
    const none = () => undefined
    expect(nearestByRank('学习', ['学生', '学校', '鹦鹉'], none, 2)).toEqual(['学生', '学校'])
  })

  test('an unranked candidate is a worse answer than a measured one, not a rejected one', () => {
    const rankOf = ranks({ 学习: 100, 学生: 105 })
    expect(nearestByRank('学习', ['鹦鹉', '学生'], rankOf, 2)).toEqual(['学生', '鹦鹉'])
  })

  test('two candidates the same distance away come back in the same order every time', () => {
    // An arrangement that moved between renders is the tile bug in another
    // costume, and it starts here rather than in the shuffle.
    const rankOf = ranks({ 学习: 100, 学生: 105, 学校: 95 })
    const once = nearestByRank('学习', ['学生', '学校'], rankOf, 2)
    const again = nearestByRank('学习', ['学校', '学生'], rankOf, 2)
    expect(once).toEqual(again)
  })

  test('says how few candidates there were by being short — padding is the caller job', () => {
    // A first session of two cards has nothing to draw a third option from. The
    // dictionary does, and this module deliberately cannot reach it.
    expect(nearestByRank('学习', ['学生'], () => undefined, 3)).toEqual(['学生'])
  })

  test('counts a word once however many times the deck lists it', () => {
    expect(nearestByRank('学习', ['学生', '学生', '学校'], () => undefined, 3)).toEqual([
      '学生',
      '学校',
    ])
  })
})

describe('nearestToAny', () => {
  test('a line gets tiles plausible beside every word in it, not just the first', () => {
    // The wrong tiles used to be sampled by index out of the known set, which
    // has no notion of similarity: on a line of common words they arrived from
    // wherever the arithmetic landed, and you could see they were wrong.
    const rankOf = ranks({ 我: 5, 图书馆: 3000, 你: 6, 博物馆: 3005, 鹦鹉: 40000 })
    expect(nearestToAny(['我', '图书馆'], ['鹦鹉', '博物馆', '你'], rankOf, 2)).toEqual([
      '你',
      '博物馆',
    ])
  })

  test('measures to the nearest word rather than to the middle of the line', () => {
    // A line pairing a first-week word with a fourth-year one has no midpoint
    // worth drawing from — the words either side of each end are the tiles.
    const rankOf = ranks({ 我: 5, 鹦鹉: 40000, 你: 6, 中间: 20000 })
    expect(nearestToAny(['我', '鹦鹉'], ['中间', '你'], rankOf, 1)).toEqual(['你'])
  })

  test('never offers a word the answer already contains', () => {
    // Two identical tiles make the check ambiguous and one of them impossible
    // to place wrongly.
    const rankOf = ranks({ 我: 5, 很: 20, 累: 200 })
    expect(nearestToAny(['我', '很'], ['很', '累'], rankOf, 3)).toEqual(['累'])
  })

  test('with no list installed the tiles still fill, in the order given', () => {
    const none = () => undefined
    expect(nearestToAny(['我', '很'], ['累', '学生', '鹦鹉'], none, 2)).toEqual(['累', '学生'])
  })
})
