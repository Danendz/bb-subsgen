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

import { buildChoices, type Choice } from '../../flashcards/choices'
import { nearestByRank } from '../../flashcards/distractors'
import { seedFor } from '../../flashcards/wordbank'
import type { Item } from '../../flashcards/types'
import type { Entry } from '../../lang/pack'
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

/**
 * Options per card id, for the word cards in `cards` and for nothing else.
 *
 * `candidates` is the deck's own word headwords — every one of them, not just
 * the ones queued today, because frequency proximity has more to work with the
 * more words it can see.
 *
 * A card absent from the result is one that cannot be asked this way: the
 * dictionary has no gloss for it, so there is no correct option to offer.
 */
export async function buildOptions(
  cards: readonly Item[],
  candidates: readonly string[],
  rankOf: (headword: string) => number | undefined,
  deps: OptionDeps,
): Promise<Map<string, Choice[]>> {
  const words = cards.filter((card) => card.kind === 'word')
  if (!words.length) return new Map()

  const deck = candidates.filter((word) => word !== '')
  const pools = new Map<string, string[]>()
  for (const card of words) {
    const near = nearestByRank(card.text, deck, rankOf, CANDIDATES)
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
