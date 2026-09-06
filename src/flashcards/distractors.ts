// Which words a wrong answer is made of.
//
// A multiple-choice question is only as good as the options nobody should pick.
// Drawn at random from the dictionary they are free — 的 against 图书馆 against
// 鹦鹉 is answered by whichever one you have met before, not by knowing the
// word. Drawn from the deck at a similar frequency they are the words actually
// being learned alongside each other, which is where the confusions live.
//
// Pure, and separate from `choices.ts` on purpose: this answers *which words*
// and that answers *which option set*. Sentence tiles want the first and none
// of the second — they pick their wrong tiles by index arithmetic over the
// known set today, which has no notion of similarity at all.

/**
 * Candidates nearest the target in frequency rank, closest first.
 *
 * `rankOf` is undefined for anything the installed frequency list does not
 * mention, and for every word when no list is installed at all — lists are
 * uploaded rather than bundled, so that is a normal state and not a failure.
 * With no rank to measure from, the candidates come back in the order they were
 * given: arbitrary, but deterministic, and still drawn from the learner's own
 * deck.
 *
 * Returns fewer than `count` when there are not that many candidates. Padding a
 * short answer out to a full set of options needs the dictionary, which this
 * module deliberately cannot reach; the caller does it.
 */
export function nearestByRank(
  target: string,
  candidates: readonly string[],
  rankOf: (headword: string) => number | undefined,
  count: number,
): string[] {
  // A word offered as its own distractor makes two options correct, which is
  // the one way an option set can be wrong rather than merely easy.
  const pool = [...new Set(candidates)].filter((word) => word !== target)
  const anchor = rankOf(target)
  if (anchor === undefined) return pool.slice(0, count)

  const ranked: Array<{ word: string; rank: number }> = []
  const unranked: string[] = []
  for (const word of pool) {
    const rank = rankOf(word)
    if (rank === undefined) unranked.push(word)
    else ranked.push({ word, rank })
  }

  // Rank and then the word itself break the tie, so two candidates equidistant
  // from the target come back in the same order every time. An arrangement that
  // moved between renders would be the tile bug in another costume.
  ranked.sort(
    (a, b) =>
      Math.abs(a.rank - anchor) - Math.abs(b.rank - anchor) ||
      a.rank - b.rank ||
      (a.word < b.word ? -1 : 1),
  )

  // Ranked first: a word the list has never heard of is a worse distractor than
  // one measured to sit next to the target, but it is a better one than nothing.
  return [...ranked.map((entry) => entry.word), ...unranked].slice(0, count)
}
