// Stored CC-CEDICT rows, turned into entries the rest of the extension can
// render, and ordered so the sense a learner wants comes first.
//
// This is the only module that reads a row's fields. Everything downstream —
// the hover card, the reader, the flashcards app, the glossary handed to the
// model — holds an `Entry`, which knows nothing about `simplified`, `pinyin`
// notation or `CL:` syntax.

import type { DictRow, Entry, Tag } from '../pack'
import { readingText } from '../reading'
import { type CedictRow, isCedictRow } from './cedict-row'
import { parseDefinitions } from './definitions'
import { readingParts } from './reading'

/** Whitespace and case only — both sides are already in display form. */
function normalizePinyin(pinyin: string): string {
  return pinyin.trim().toLowerCase().replace(/\s+/g, ' ')
}

/** CC-CEDICT capitalizes readings of proper nouns, e.g. "He2" for the surname. */
function isProperNoun(pinyin: string): boolean {
  return /^[A-Z]/.test(pinyin.trim())
}

function hasTag(tags: readonly Tag[], kind: Tag['kind']): boolean {
  return tags.some((tag) => tag.kind === kind)
}

/**
 * Whether an entry only ever points somewhere else.
 *
 * Every sense, not any: 和 has an entry that is nothing but "old variant of 和",
 * and one that reads "and; together with" alongside a cross-reference. Only the
 * first is worthless to show.
 */
function isStub(entry: Entry): boolean {
  return entry.senses.every((sense) => hasTag(sense.tags, 'stub'))
}

/**
 * Whether a headword is a phrasebook line rather than a word.
 *
 * CC-CEDICT documents some character sequences that are not lexical units at
 * all — 過得|过得 is glossed "How are you getting by?", but in 时间过得很快 it is
 * a verb followed by a structural particle. Greedy segmentation cannot tell the
 * difference, so it took the span, printed `guo4 de2` over a particle that reads
 * `de5`, and offered "How's life?" as the gloss.
 *
 * The test is deliberately narrow: a *capitalized* definition that *ends in
 * terminal punctuation* is prose, not a sense. Neither signal is enough alone —
 * 什么 glosses as "what?" and every proper noun is capitalized, and both must
 * keep segmenting. Excluding too little is recoverable; excluding a real word
 * takes it out of the language.
 */
export function isPhrase(entry: Entry): boolean {
  const [primary] = entry.senses
  if (!primary) return false
  return /^[A-Z]/.test(primary.gloss) && /[.!?]$/.test(primary.gloss.trim())
}

/**
 * Headwords that are real words but far worse readings than the two words they
 * are made of.
 *
 * 我去 is the case that forced this: CC-CEDICT lists it as internet slang for
 * "what the ...!", which is true, and nothing about the entry reveals that
 * 我 + 去 ("I go") is hundreds of times commoner. Only frequency separates them,
 * and no frequency list ships with this extension — every usable one is somebody
 * else's to license, which is why the word-list feature asks you to supply your
 * own. So the handful of headwords in this position are named here instead.
 *
 * Named rather than inferred on purpose. The tempting general rule — distrust a
 * compound beginning with a pronoun — takes 你好 and 我们 down with it.
 *
 * Keep this list short. It is an admission that a signal is missing, not a place
 * to fix segmentation one word at a time.
 */
const NOT_A_WORD_SPAN: ReadonlySet<string> = new Set([
  '我去', // (slang) what the ...! — vs 我 + 去
])

/** Whether a headword must never claim a span while cutting a sentence into words. */
export function excludeFromSegmentation(entry: Entry, headword: string): boolean {
  return NOT_A_WORD_SPAN.has(headword) || hasTag(entry.tags, 'phrase')
}

function entryFrom(row: CedictRow, traditional: boolean): Entry {
  const written = traditional ? row.traditional : row.simplified
  const other = traditional ? row.simplified : row.traditional
  const { senses, classifiers } = parseDefinitions(row.definitions, traditional)

  const entry: Entry = {
    headword: written,
    variants: other === written ? [] : [other],
    // Aligned against the entry's own spelling rather than the headword that
    // was looked up: an entry reached through its other script — 咊 for 和 — is
    // read as the word it actually is.
    reading: readingParts(written, row.pinyin),
    senses,
    tags: [...classifiers],
  }

  if (isProperNoun(row.pinyin)) entry.tags.push({ kind: 'proper-noun' })
  if (isPhrase(entry)) entry.tags.push({ kind: 'phrase' })
  return entry
}

/**
 * Every entry a set of stored rows carries, in the order they were stored.
 *
 * Rows that are not CC-CEDICT rows are dropped rather than thrown on. They
 * arrive typed `DictRow`, which is `unknown`, from a database written by
 * whichever install ran last — and a card with no definition is a far better
 * failure than an exception inside a hover.
 */
export function entriesFrom(
  rows: DictRow[],
  // Chinese needs no part of it: a row names both its spellings, and which one
  // is shown is the script setting's business. On the interface because a
  // dictionary listing several spellings per entry — JMdict, #14 — has to know
  // which one was asked for.
  _headword: string,
  opts: { traditional: boolean },
): Entry[] {
  const entries: Entry[] = []
  for (const row of rows) {
    if (isCedictRow(row)) entries.push(entryFrom(row, opts.traditional))
  }
  return entries
}

function score(entry: Entry, headword: string, displayedReading: string | undefined): number {
  let value = 0

  // Strongest signal: the reading already shown above the character. Compared
  // as display text on both sides, because that is the only form the caller
  // still has — a `ReadingPart` carries `xǐ`, and CC-CEDICT's `xi3` never
  // leaves this directory now.
  if (
    displayedReading &&
    normalizePinyin(readingText(entry.reading)) === normalizePinyin(displayedReading)
  ) {
    value += 100
  }

  // An entry whose own headword is this character in both scripts is the
  // canonical one. Entries reached only because their *other* script maps
  // here — 咊 and 龢 both simplify to 和 — rank below it. No variants at all is
  // what "the same in both scripts" looks like once a row has become an entry.
  if (entry.headword === headword && !entry.variants.length) value += 50
  else if (entry.headword === headword) value += 20

  if (isStub(entry)) value -= 40
  if (hasTag(entry.tags, 'proper-noun')) value -= 15

  // Tiebreak: the reading a character is usually given is the one lexicographers
  // had the most to say about. Without this, two readings of one character were
  // separated by nothing but file order — and CC-CEDICT sorts by reading, so the
  // rare one often came first. 说 shipped as `shui4` ("to persuade") rather than
  // `shuo1`, and 跑 as `pao2` ("to paw the ground") rather than `pao3`.
  //
  // Capped, and small enough to sit under every signal above it: a rich rare
  // sense must not outvote the reading actually displayed on the subtitle.
  value += Math.min(entry.senses.length, 5)

  return value
}

/**
 * Orders entries so the most useful sense comes first.
 *
 * The store keys rows by both scripts in file order, so `entries[0]` is
 * whichever line happened to appear first — for 和 that is the variant entry
 * keyed under 咊, which reads "old variant of 和" rather than "and".
 *
 * Sorts and never maps. `bestRow` depends on that: it pairs the winner back to
 * the row it came from by identity.
 */
export function rank(entries: Entry[], headword: string, displayedReading?: string): Entry[] {
  return entries
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => {
      const diff =
        score(b.entry, headword, displayedReading) - score(a.entry, headword, displayedReading)
      return diff !== 0 ? diff : a.index - b.index // stable within equal scores
    })
    .map(({ entry }) => entry)
}

/**
 * The row the install should take a headword's reading from, and the entry that
 * row became.
 *
 * Both, because the two things written to the lexicon come from opposite sides
 * of the conversion: the reading has to be CC-CEDICT's own `xi3 huan5` notation,
 * which `Entry.reading` has thrown away and which `applyReadingRules` and the
 * function-word table still compare against, while the phrasebook flag is a tag.
 * Writing display text there instead would change the stored lexicon format and
 * oblige every user to re-install.
 *
 * The pairing by index lives here rather than in `src/dict/` so that nothing
 * outside this directory has to know a row and an entry line up at all.
 */
export function bestRow(
  rows: CedictRow[],
  headword: string,
  declaredReading?: string,
): { row: CedictRow; entry: Entry } {
  const entries = entriesFrom(rows, headword, { traditional: false })
  const [best] = rank(entries, headword, declaredReading)
  return { row: rows[entries.indexOf(best)], entry: best }
}
