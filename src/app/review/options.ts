// Every option set the session will need, resolved before the session starts.
//
// This runs once, at session build, and not per card. Resolving a card's
// options when the card comes up would render the answer already translated and
// the distractors still in English, because English is the fallback rather than
// a loading state (`useTranslatedGlosses`) — which hands over the answer without
// anyone having to know the word. It would also put a pause in front of every
// card.
//
// Impure only in what it is given: the definition lookup, the ranking, the
// dictionary search and the translation all arrive as parameters, in the same
// way `src/llm/client.ts` takes its `fetch`. That is what lets the rule below —
// an option set is wholly in one language or wholly in the other — be tested
// without a store, a worker or a browser.
//
// Three kinds of card, three sources of wrong answers, one rule they share: an
// option set is drawn from the same population as its answer. Words draw on
// near-ranked words, lines on other captured translations, patterns on other
// patterns. Only the first of those has to ask a dictionary anything, which is
// why it is the only one of the three that is async.

import { buildChoices, type Choice } from '../../flashcards/choices'
import { nearestByRank } from '../../flashcards/distractors'
import { seedFor, shuffle } from '../../flashcards/wordbank'
import type { Item } from '../../flashcards/types'
import type { Entry, Pattern } from '../../lang/pack'
import type { GlossRequest } from '../../dict/gloss-translate'

/**
 * Candidates asked for per card, against the three that will be shown.
 *
 * The spares are what absorbs a candidate the dictionary cannot gloss and a
 * candidate whose gloss collides with the answer's. Measured against nothing —
 * it is a guess at how often those happen — but being generous costs a longer
 * list in one batched lookup, and being exact costs a three-option question.
 */
const CANDIDATES = 6

/** A question needs something wrong in it. One option is a statement. */
const MIN_OPTIONS = 2

export interface OptionDeps {
  /** One batched definition lookup for every headword the session could show. */
  defs: (headwords: string[]) => Promise<Record<string, Entry[]>>
  /** The sense this word is best known by, in English, or `''` if it has none. */
  glossOf: (entries: Entry[], headword: string) => string
  /** Dictionary headwords to fall back on, for a deck too small to fill a question. */
  padding: (headword: string, exclude: ReadonlySet<string>, count: number) => string[]
  /** The same glosses in the reading language. A headword missing from the result has none. */
  translate: (requests: GlossRequest[]) => Promise<Record<string, string[]>>
}

export interface OptionSources {
  /**
   * The whole deck, not the cards queued today: how near two words sit in
   * frequency is a better question the more words there are to ask it of, and
   * a session of three lines has almost no wrong translations in it.
   */
  deck: readonly Item[]
  /** The language's patterns. Empty is a normal state — see `LanguagePack.findPatterns`. */
  patterns: readonly Pattern[]
  rankOf: (headword: string) => number | undefined
}

/**
 * Options per card id, for every card in `cards` that can be asked for one.
 *
 * A card absent from the result is one that cannot be asked this way, and each
 * kind falls out for its own reason: the dictionary has no gloss for the word,
 * the line was captured without a translation, the pattern table no longer
 * carries the pattern. In all three there is no correct option to offer, and an
 * option set with nothing right in it is worse than not asking.
 */
export async function buildOptions(
  cards: readonly Item[],
  sources: OptionSources,
  deps: OptionDeps,
): Promise<Map<string, Choice[]>> {
  return new Map([
    ...lineOptions(cards, sources.deck),
    ...patternOptions(cards, sources.patterns),
    ...(await wordOptions(cards, sources, deps)),
  ])
}

/** The last place this card was met, which is the one every screen shows. */
function latest(card: Item) {
  return card.contexts[card.contexts.length - 1]
}

/**
 * The meanings a word card offers.
 *
 * The only one of the three that reaches outside the deck: a headword is not
 * carrying its own gloss around the way a captured line carries its
 * translation, so the definitions have to be looked up and then translated.
 */
async function wordOptions(
  cards: readonly Item[],
  { deck, rankOf }: OptionSources,
  deps: OptionDeps,
): Promise<Map<string, Choice[]>> {
  const words = cards.filter((card) => card.kind === 'word')
  if (!words.length) return new Map()

  const candidates = deck.flatMap((item) => (item.kind === 'word' && item.text ? [item.text] : []))
  const pools = new Map<string, string[]>()
  for (const card of words) {
    const near = nearestByRank(card.text, candidates, rankOf, CANDIDATES)
    // Only a deck with barely anything in it reaches the dictionary, which is
    // what keeps the search — a walk of every headword the language has — off
    // the path a normal session takes. A first session of two cards is not a
    // reason to meet a different exercise from everyone else.
    const short = CANDIDATES - near.length
    const padding = short > 0 ? deps.padding(card.text, new Set([card.text, ...near]), short) : []
    pools.set(card.id, [...near, ...padding])
  }

  const headwords = new Set<string>()
  for (const card of words) {
    headwords.add(card.text)
    for (const word of pools.get(card.id) ?? []) headwords.add(word)
  }
  const found = await deps.defs([...headwords])

  const english = new Map<string, string>()
  for (const headword of headwords) {
    const gloss = deps.glossOf(found[headword] ?? [], headword)
    if (gloss) english.set(headword, gloss)
  }

  const translated = await deps.translate(
    [...english].map(([headword, gloss]) => ({ headword, senses: [gloss] })),
  )

  const sets = new Map<string, Choice[]>()
  for (const card of words) {
    if (!english.has(card.text)) continue
    const pool = [card.text, ...(pools.get(card.id) ?? [])].filter((word) => english.has(word))

    // Wholly translated or wholly English. A translator that answered for three
    // words of four leaves the fourth standing in a different language from its
    // neighbours, and the option that does not match the others is the one
    // everybody picks — the same giveaway this module is ordered to avoid,
    // arriving one round later.
    const whole = pool.every((word) => translated[word]?.[0])
    const glossOf = (word: string) =>
      (whole ? translated[word]?.[0] : undefined) ?? english.get(word) ?? ''

    const [answer, ...rest] = pool
    const choices = buildChoices(glossOf(answer), rest.map(glossOf), seedFor(card.id, card.reps))
    if (choices.length >= MIN_OPTIONS) sets.set(card.id, choices)
  }

  return sets
}

/**
 * The translations a sentence card offers.
 *
 * Synchronous, and that is the point: the answer and every wrong option are
 * translations already frozen on cards, so there is no round trip that could
 * land for three options and not the fourth.
 *
 * `nearestByRank` has nothing to measure here — a frequency list ranks
 * headwords, not sentences — so the pool is shuffled with the card's own seed
 * instead. Taking it in deck order would deal every line in the session the
 * same three wrong answers, which is a set you can learn instead of reading.
 */
function lineOptions(cards: readonly Item[], deck: readonly Item[]): Map<string, Choice[]> {
  const lines = deck.filter((item) => item.kind === 'sentence')
  const sets = new Map<string, Choice[]>()

  for (const card of cards) {
    if (card.kind !== 'sentence') continue
    const context = latest(card)
    if (!context?.translation) continue

    // Grouped by the language the translation is tagged with, for the reason
    // the word path translates all or nothing: the one option in Spanish among
    // three in English is the one everybody picks. A deck captured before the
    // tag existed is wholly untagged rather than mixed, so grouping on
    // `undefined` keeps that world whole too.
    const lang = context.translationLang
    const pool = lines.flatMap((other) => {
      if (other.id === card.id) return []
      const met = latest(other)
      if (!met?.translation || met.translationLang !== lang) return []
      return [met.translation]
    })

    // Built against the translation as stored, which `useTranslationHealing`
    // may rewrite while the card is on screen. The pick is graded on the flag
    // rather than on the string, so a healed card still grades correctly; the
    // reveal simply answers in the newer language.
    const seed = seedFor(card.id, card.reps)
    const choices = buildChoices(context.translation, shuffle(pool, seed), seed)
    if (choices.length >= MIN_OPTIONS) sets.set(card.id, choices)
  }

  return sets
}

/**
 * The explanations a grammar card offers.
 *
 * The wrong ones are other patterns, because other patterns are what a
 * pattern's alternatives are — a word's meaning is not a candidate answer to
 * "what does this shape do". `hsk` is what `nearestByRank` measures over them,
 * on the same argument frequency rank makes for words: the structures
 * introduced around the same time are the ones actually confused with each
 * other.
 *
 * Left in English, as the explanations themselves are everywhere else in the
 * app — they are written by hand in the language pack, not translated out of a
 * dictionary, so there is nothing here that could arrive half-translated.
 */
function patternOptions(
  cards: readonly Item[],
  patterns: readonly Pattern[],
): Map<string, Choice[]> {
  const sets = new Map<string, Choice[]>()
  if (!patterns.length) return sets

  const byId = new Map(patterns.map((pattern) => [pattern.id, pattern]))
  const ids = patterns.map((pattern) => pattern.id)

  for (const card of cards) {
    if (card.kind !== 'grammar' || !card.patternId) continue
    const own = byId.get(card.patternId)
    if (!own?.explanation) continue

    const near = nearestByRank(own.id, ids, (id) => byId.get(id)?.hsk, CANDIDATES)
    const choices = buildChoices(
      own.explanation,
      near.map((id) => byId.get(id)?.explanation ?? ''),
      seedFor(card.id, card.reps),
    )
    if (choices.length >= MIN_OPTIONS) sets.set(card.id, choices)
  }

  return sets
}
