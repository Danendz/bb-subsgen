// What a hover card is about, as data — before anything draws it.
//
// `buildCard` had three callers assembling its argument by hand, and two of
// them are the same reader. The rules being duplicated are the ones a language
// pack made subtle: which of a match's two names the card is *about*, and which
// reading may be handed to `pack.rank` as a signal. Written twice, they drift;
// written here, they are six lines with a `node` test over them.
//
// Beside `card.ts` rather than under `reader/`, because the reader already
// imports the content card and not the other way round — and `characterBreakdown`
// lives here now, so a model that needs it does not drag the renderer's
// direction into reverse. `hover.ts` is the third caller and still builds its
// own; that file belongs to the overlay refactor.

import type { CardData } from './card'
import type { Entry, LanguagePack, Lexicon, Match, ReadingPart } from '../lang/pack'
import { readingText } from '../lang/reading'

export interface CharacterGloss {
  char: string
  reading: ReadingPart[]
  gloss: string
}

/**
 * Builds the per-character rows for a multi-character word.
 *
 * Single characters get nothing: the breakdown of 我 is 我, which is noise.
 * Characters with no entry of their own are dropped rather than shown blank.
 */
export function characterBreakdown(
  headword: string,
  found: Record<string, Entry[]>,
  pack: LanguagePack,
): CharacterGloss[] {
  // The same list the lookup was batched from, minus the whole word: a
  // breakdown is exactly the pieces that lookup already asked about.
  const chars = pack.cardHeadwords(headword).slice(1)
  if (!chars.length) return []

  const rows: CharacterGloss[] = []
  for (const char of chars) {
    const [primary] = pack.rank(found[char] ?? [], char)
    if (!primary?.senses.length) continue
    rows.push({
      char,
      reading: primary.reading,
      gloss: primary.senses.map((sense) => sense.gloss).join('; '),
    })
  }
  return rows
}

/**
 * What the card is *about*, which on an inflected word is not what is on the
 * page: hovering 食べました asks the dictionary about 食べる, files 食べる into the
 * deck, and marks 食べる known. `match.text` stays the surface, because that is
 * what a highlight underlines and what `patternsForWord` finds in the segmented
 * line.
 */
export function headwordOf(match: Match): string {
  return match.dictionary ?? match.text
}

/**
 * The reading to hand the card as its ranking signal, or `''` for none.
 *
 * The reading on screen belongs to the surface — たべました, not たべる — and
 * `pack.rank` documents its argument as the *headword's* reading. On a
 * deinflected word it is therefore not the signal it looks like, and passing it
 * anyway ranks 食べる by a reading no entry for 食べる carries. The headword's
 * own comes off whichever entry wins instead.
 *
 * `override` is for a word hovered inside the selection card, which has no
 * match of its own to have resolved and carries its reading on the element.
 */
export function displayedReadingFor(match: Match, override?: string): string {
  if (override !== undefined) return override
  return match.dictionary ? '' : readingText(match.reading)
}

export interface CardInput {
  match: Match
  /** The batched lookup's reply — the headword and each of its characters. */
  found: Record<string, Entry[]>
  /** Null before the word list has loaded, which renders no patterns rather than failing. */
  lexicon: Lexicon | null
  pack: LanguagePack
  known: ReadonlySet<string>
  /** The line the word was met in, which the patterns are looked for in. */
  sentence: string
  /** Overrides the match's own reading — see `displayedReadingFor`. */
  shownReading?: string
}

export function cardData({
  match,
  found,
  lexicon,
  pack,
  known,
  sentence,
  shownReading,
}: CardInput): CardData {
  const headword = headwordOf(match)
  return {
    headword,
    displayedReading: displayedReadingFor(match, shownReading),
    entries: found[headword] ?? [],
    breakdown: characterBreakdown(headword, found, pack),
    // The surface, not the headword: the patterns are looked for in the
    // segmented line, where the word appears as it is written.
    patterns: lexicon ? pack.patternsForWord(lexicon.segment(sentence), match.text) : [],
    known: known.has(headword),
  }
}
