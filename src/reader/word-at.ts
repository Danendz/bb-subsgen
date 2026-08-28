// Which word a point in a block of text lands on, and the sentence around it.
//
// The half of `wordUnder` that is not DOM. Everything above it — the caret hit
// test, the block ancestor, the offset into the flattened text, and the `Range`
// built back out of the answer — needs a document; this needs a string and an
// index, so it is where the decision can actually be tested.

import type { Lexicon, Match } from '../lang/pack'

/**
 * Takes a `Lexicon` rather than a pack and a lexicon, because a lexicon carries
 * its `pack` back-reference — the point `architecture.md` makes about the two
 * levels: code holding one is never handed both.
 */
export function wordAt(
  lexicon: Lexicon,
  blockText: string,
  index: number,
): { match: Match; sentence: string } | null {
  const match = lexicon.matchAt(blockText, index)
  if (!match) return null
  return { match, sentence: lexicon.pack.sentenceTextAt(blockText, index) }
}
