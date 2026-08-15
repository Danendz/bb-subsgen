// What each word of a line on a study card should render as.
//
// Pure, and separate from the component, because every decision here is a rule
// worth stating rather than a rendering detail: which words get a reading, which
// one is blanked, which one is the card's own. The component below it only turns
// these flags into spans.

import { isHan, segment } from '../../lang/segment'
import type { Lexicon } from '../../lang/dict'
import { isFunctionWord } from '../../lang/grammar/function-words'

export interface LineToken {
  text: string
  /** Numeric CC-CEDICT pinyin, absent for punctuation and unmatched characters. */
  pinyin: string | null
  /** Chinese the dictionary can be asked about — the rest is inert. */
  han: boolean
  /** The card's own word, picked out of its example. */
  marked: boolean
  /** Replaced by a gap: the word the card is asking for. */
  blanked: boolean
  /** Show the reading above this word. */
  reading: boolean
  /**
   * A word doing grammatical work rather than carrying meaning.
   *
   * Rendered dimmer, the same as on the video overlay, so a line reads as
   * vocabulary against structure in both places. See `isFunctionWord`.
   */
  structural: boolean
}

export interface LineOptions {
  known: ReadonlySet<string>
  /**
   * Show readings over the words not yet known.
   *
   * Off on a question, on for an answer. A question gives nothing until it is
   * asked for — that is what the popup is — and an answer has nothing left to
   * protect.
   */
  readings?: boolean
  /** The card's headword, to pick out of the line. */
  mark?: string
  /** The cloze target, to replace with a gap. */
  blank?: string
}

/**
 * A line, word by word, with what each one should show.
 *
 * Readings follow the same rule as the video overlay: a word you have declared
 * known or reviewed to maturity loses its pinyin, so what is left annotated is
 * exactly what you could not read. The popup ignores that rule and works on
 * every word, because "known" is a claim about the general case and forgetting
 * one is the specific case it cannot cover.
 */
export function lineTokens(
  text: string,
  lexicon: Lexicon,
  { known, readings = false, mark, blank }: LineOptions,
): LineToken[] {
  // Only the first occurrence is blanked. A line using the target twice still
  // asks for one word, and blanking both would make the question a different,
  // harder one than the card was scheduled as.
  let blanked = false

  return segment(text, lexicon).map((token) => {
    const han = token.text.length > 0 && isHan(token.text[0])
    const gap = han && !blanked && token.text === blank
    if (gap) blanked = true

    return {
      text: token.text,
      pinyin: token.pinyin,
      han,
      marked: han && !gap && token.text === mark,
      blanked: gap,
      reading: Boolean(readings) && han && !gap && !known.has(token.text),
      structural: han && isFunctionWord(token.text),
    }
  })
}
