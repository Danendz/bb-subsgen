// Stored JMdict rows, turned into entries the rest of the extension can render,
// and ordered so the sense a learner wants comes first.
//
// The Japanese counterpart of `zh/entries.ts`, and the only module that reads a
// `JmdictRow`'s fields. Everything downstream — the hover card, the flashcards
// app, the glossary handed to the model — holds an `Entry`, which knows nothing
// about `re_restr`, priority bands or entity-ref part-of-speech codes.
//
// **Where the ordering lives.** Chinese puts every signal in `rank`, because
// CC-CEDICT's are all recoverable from the entry: the reading is on it, a
// proper noun is capitalized in the pinyin, a stub says "variant of" in its
// gloss. Two of Japanese's are not. Whether a spelling is the common one and
// whether it is `rK`-rare are facts about the *row*, and an `Entry` deliberately
// has nowhere to put them — widening `Tag` for them would turn every exhaustive
// switch over `Tag` in the card renderers into a compile error for the sake of
// two booleans nothing draws.
//
// So the split is by what the signal is a fact about, not by convenience:
// `entriesFrom` applies everything the row knows and the entry cannot carry,
// while the entry is still beside its row. `rank` then adds the one signal no
// row carries — the reading the learner was actually shown — and is otherwise a
// stable sort, so the order below it survives. Both live here, which is what
// `.claude/rules/llm-and-asr.md` means by one ranking per language.

import type { DictRow, Entry, Sense, Tag } from '../pack'
import { readingText } from '../reading'
import { furiganaParts } from './furigana'
import { type JmdictKana, type JmdictRow, isJmdictRow } from './jmdict-row'
import { isKana, toHiragana } from './script'

/** `ke_inf` codes that say a spelling is not how the word is normally written. */
const RARE_KANJI_TAGS: ReadonlySet<string> = new Set(['rK', 'oK', 'sK', 'iK'])

/** `re_inf` codes, the same thing for a reading. */
const RARE_KANA_TAGS: ReadonlySet<string> = new Set(['ok', 'rk', 'sk', 'ik'])

/** `misc` codes that put a whole sense out of current use. */
const RARE_MISC: ReadonlySet<string> = new Set(['arch', 'obs', 'obsc', 'rare'])

/** `misc` codes that make an entry a name rather than a word. */
const NAME_MISC: ReadonlySet<string> = new Set([
  'surname',
  'given',
  'place',
  'organization',
  'person',
])

/**
 * Both sides of a reading comparison, made comparable.
 *
 * Whitespace goes because `readingText` puts a separator between the parts of a
 * word with two annotated runs — 食べ物 comes back as `た もの` — and the reading
 * a dictionary wrote has none. Katakana folds to hiragana for the reason
 * `toHiragana` exists.
 */
function normalizeReading(reading: string): string {
  return toHiragana(reading.replace(/\s+/g, ''))
}

export function isAllKana(text: string): boolean {
  return text.length > 0 && Array.from(text).every(isKana)
}

/**
 * The reading this spelling is read with, or null where the row has none.
 *
 * `re_restr` is the whole point: 幸せ/しあわせ and 幸い/さいわい share one entry,
 * and a reading that names its spellings must only be offered for those. A
 * `re_nokanji` reading names none, so it is never a reading *of* a spelling —
 * only a headword in its own right.
 */
function readingFor(row: JmdictRow, headword: string): JmdictKana | null {
  const own = row.kana.find((kana) => kana.text === headword)
  if (own) return own

  const admitting = row.kana.filter(
    (kana) =>
      !kana.nokanji && (kana.restrictedTo.length === 0 || kana.restrictedTo.includes(headword)),
  )
  return admitting.find((kana) => kana.common) ?? admitting[0] ?? null
}

/** Whether this spelling is the ordinary way to write the word, in this row. */
function isCommonIn(row: JmdictRow, headword: string): boolean {
  const spelling =
    row.kanji.find((kanji) => kanji.text === headword) ??
    row.kana.find((kana) => kana.text === headword)
  return spelling?.common ?? false
}

/**
 * Whether this spelling is rare, archaic or irregular in this row.
 *
 * Two ways to be: the spelling itself is marked, or every sense the entry has
 * is out of use. Every, not any — a word with one archaic sense and one current
 * one is a current word.
 */
export function isRareIn(row: JmdictRow, headword: string): boolean {
  const kanji = row.kanji.find((entry) => entry.text === headword)
  if (kanji?.tags.some((tag) => RARE_KANJI_TAGS.has(tag))) return true
  const kana = row.kana.find((entry) => entry.text === headword)
  if (kana?.tags.some((tag) => RARE_KANA_TAGS.has(tag))) return true
  return (
    row.senses.length > 0 &&
    row.senses.every((sense) => sense.misc.some((misc) => RARE_MISC.has(misc)))
  )
}

function isNameRow(row: JmdictRow): boolean {
  return (
    row.senses.length > 0 &&
    row.senses.every((sense) => sense.misc.some((misc) => NAME_MISC.has(misc)))
  )
}

function sensesOf(row: JmdictRow): Sense[] {
  const senses: Sense[] = []
  for (const sense of row.senses) {
    // JMdict separates the glosses of one sense with a semicolon when it prints
    // them, and so does the card. `pos` and `field` ride along in the stored row
    // unread — #17 is what puts them on screen.
    const gloss = sense.gloss.filter(Boolean).join('; ')
    if (gloss) senses.push({ gloss, tags: [] })
  }
  return senses
}

function entryFrom(row: JmdictRow, headword: string): Entry {
  const kana = readingFor(row, headword)
  const tags: Tag[] = []
  if (isNameRow(row)) tags.push({ kind: 'proper-noun' })

  return {
    headword,
    // The other spellings of the same word. For a kana headword those are the
    // kanji forms — "also written 食べる" is the useful thing to say — and for a
    // kanji headword they are the other kanji forms, never its own reading,
    // which is already drawn above it.
    variants: row.kanji.map((kanji) => kanji.text).filter((text) => text !== headword),
    reading: kana ? furiganaParts(headword, kana.text) : [],
    senses: sensesOf(row),
    tags,
  }
}

/** An entry and the row it came from, so the row's own signals can order them. */
interface Ordered {
  entry: Entry
  row: JmdictRow
}

/**
 * Every entry a set of stored rows carries, best first.
 *
 * Rows that are not JMdict rows are dropped rather than thrown on, exactly as
 * `zh/entriesFrom` drops non-CC-CEDICT ones: they arrive typed `DictRow`, which
 * is `unknown`, from a database written by whichever install ran last.
 */
export function orderedEntries(rows: DictRow[], headword: string): Ordered[] {
  const pairs: Ordered[] = []
  for (const row of rows) {
    if (isJmdictRow(row)) pairs.push({ entry: entryFrom(row, headword), row })
  }

  // Lower sorts first. Common before ordinary, ordinary before rare, words
  // before names, and richer entries before thinner ones — the last capped, as
  // Chinese caps it, so that a well-documented rare sense never outranks the
  // spelling the learner is actually looking at.
  const score = ({ entry, row }: Ordered): number => {
    let value = 0
    if (isCommonIn(row, headword)) value -= 100
    if (isRareIn(row, headword)) value += 40
    if (entry.tags.some((tag) => tag.kind === 'proper-noun')) value += 15
    value -= Math.min(entry.senses.length, 5)
    return value
  }

  return pairs
    .map((pair, index) => ({ pair, index }))
    .sort((a, b) => score(a.pair) - score(b.pair) || a.index - b.index)
    .map(({ pair }) => pair)
}

/**
 * `traditional` is a display choice one language happens to have — which of two
 * scripts to write Chinese in — and Japanese has no answer to it. Ignored, not
 * an error: it is on the interface because CC-CEDICT needs it, and a pack that
 * does not is entitled to say nothing.
 */
export function entriesFrom(
  rows: DictRow[],
  headword: string,
  _opts: { traditional: boolean },
): Entry[] {
  return orderedEntries(rows, headword).map(({ entry }) => entry)
}

/**
 * Orders entries so the most useful sense comes first.
 *
 * Adds the one signal a row does not carry: the reading already on screen.
 * Katakana is folded to hiragana on both sides before comparing, because a
 * katakana surface is routinely paired with a hiragana reading and the two are
 * the same sounds written twice.
 *
 * Sorts and never maps, and is stable — which is what preserves the order
 * `entriesFrom` established underneath it.
 */
export function rank(entries: Entry[], _headword: string, displayedReading?: string): Entry[] {
  const shown = normalizeReading(displayedReading ?? '')
  if (!shown) return entries

  return entries
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => {
      const misses = (entry: Entry) =>
        normalizeReading(readingText(entry.reading)) === shown ? 0 : 1
      return misses(a.entry) - misses(b.entry) || a.index - b.index
    })
    .map(({ entry }) => entry)
}

/**
 * Verb and adjective classes #15's deinflection has to know, as JMdict writes
 * them.
 *
 * Kept in the lexicon line rather than looked up when needed, because the
 * candidate loop that validates a guessed dictionary form runs *inside* the
 * segmenter, which is synchronous over the lexicon text — there is no async
 * round trip to the definitions store available there. And the lexicon is
 * written once, at install time: a field added in #17 instead would cost every
 * Japanese user a 10.5MB re-download.
 */
const WORD_CLASSES: ReadonlySet<string> = new Set([
  'v1',
  'v1-s',
  'v5aru',
  'v5b',
  'v5g',
  'v5k',
  'v5k-s',
  'v5m',
  'v5n',
  'v5r',
  'v5r-i',
  'v5s',
  'v5t',
  'v5u',
  'v5u-s',
  'v5uru',
  'vk',
  'vs',
  'vs-i',
  'vs-s',
  'vz',
  'adj-i',
])

/** What one headword's lexicon line says, beyond the headword itself. */
export interface LexiconFacts {
  /** The kana this spelling is read as. A kana headword reads as itself. */
  reading: string
  /**
   * Flag tokens, comma-separated in the stored line.
   *
   * `r` is the Chinese `p` flag's counterpart: a spelling segmentation must
   * never claim a span with, though lookup still finds it. The other token, when
   * there is one, is the word class above.
   */
  flags: string[]
}

/**
 * The reading and flags the install writes for one headword.
 *
 * The Japanese `bestRow`: it exists for the same reason, which is that the
 * install has to agree with the hover card about which sense a word has. The
 * winner is `orderedEntries`' first pair, so the reading written into the
 * lexicon is the reading the card will show.
 */
export function lexiconFacts(rows: DictRow[], headword: string): LexiconFacts {
  const ordered = orderedEntries(rows, headword)
  const flags: string[] = []

  // Rare in every row it appears in. One current sense anywhere is enough to
  // make the spelling a word the segmenter may take.
  if (ordered.length && ordered.every(({ row }) => isRareIn(row, headword))) flags.push('r')

  const wordClass = ordered
    .flatMap(({ row }) => row.senses.flatMap((sense) => sense.pos))
    .find((pos) => WORD_CLASSES.has(pos))
  if (wordClass) flags.push(wordClass)

  // A kana headword reads as itself; there is nothing to draw above it.
  if (isAllKana(headword)) return { reading: headword, flags }

  const best = ordered[0]
  return { reading: (best && readingFor(best.row, headword)?.text) ?? '', flags }
}
