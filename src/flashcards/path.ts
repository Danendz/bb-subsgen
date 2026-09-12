// The path: the frequency list cut into circles, and what each circle is worth.
//
// The whole model of the home screen, with no DOM and no database in it — rows
// in, model out — so every rule below is testable without a screen. That split
// is the point: "have I met all eight of these" and "is this one mastered" are
// the questions the screen exists to answer, and they are exactly the ones a
// component test could never ask cheaply.
//
// Two things are deliberately *not* here. Nothing is stored: all four circle
// states are derived on every render from `ranks` and the deck as they stand,
// so there is no schema change, no migration and nothing that can disagree with
// the deck. And mastery does not decay — a circle that empties itself while you
// are not looking is the mechanic most likely to stop you opening the app.
//
// Mastery is `isKnown`, the maturity rule that already stops the overlay
// annotating a word, rather than a threshold of this module's own. Two rules
// for "you know this" drift, and the visible symptom would be a word the
// subtitles have stopped glossing sitting inside a circle that still says it is
// unfinished.

import { isKnown } from './known'
import type { Item, Rank } from './types'
import type { SectionScheme } from '../lang/pack'

/**
 * Words to a circle, and circles to a unit.
 *
 * Eight is a sitting: taught and then asked once each is sixteen screens, which
 * is about the length of the sessions the deck already schedules. Five of them
 * is forty words, which is the smallest band that reads as an achievement on a
 * list eleven thousand words long.
 */
export const CIRCLE_WORDS = 8
export const UNIT_CIRCLES = 5

/**
 * Section size for a language whose pack names no scheme.
 *
 * Five units, so a section is still a thing you can finish. A language with an
 * exam scale overrides this with its own bands — see `SectionScheme`.
 */
const PLAIN_SECTION_WORDS = UNIT_CIRCLES * CIRCLE_WORDS * 5

export interface Circle {
  /**
   * Position over the whole path.
   *
   * Global rather than per-unit so that one number is both the key and the
   * thing the screen can be asked to scroll to, and so `waiting` can name a
   * circle without also carrying which unit it was in.
   */
  index: number
  /** Its words, in rank order. */
  words: string[]
  /** Rank of its first and last word, so a header can say where on the list you are. */
  from: number
  to: number
}

export interface Unit {
  /** Position within its section. */
  index: number
  circles: Circle[]
}

export interface Section {
  index: number
  /** What the scheme calls it. Absent where the language has no scheme. */
  name?: string
  units: Unit[]
}

/**
 * The ranked word list, banded into sections, units and circles.
 *
 * Unranked rows are dropped rather than tacked on the end. The pinned dataset
 * is exam vocabulary ranked by subtitle frequency, so a word arrives unranked
 * because the corpus never saw it — `newWords()` already sorts those last, and
 * a circle of eight words nobody ever says is not a step on a path.
 *
 * A section boundary is always a circle boundary, which is why circles are cut
 * inside a section rather than off a global word index: no scheme's band is a
 * multiple of eight, so the alternative puts a circle half in HSK 1 and half in
 * HSK 2 and leaves neither section able to say what it contains. The cost is a
 * short circle at the end of each section, which `circleState` handles by
 * counting the circle's own words rather than assuming eight.
 */
export function bandsFor(ranks: readonly Rank[], scheme?: SectionScheme): Section[] {
  const ordered = ranks
    .filter((rank): rank is Rank & { rank: number } => rank.rank !== undefined)
    .sort((a, b) => a.rank - b.rank)

  const sections: Section[] = []
  let at = 0
  let circles = 0

  while (at < ordered.length) {
    const index = sections.length
    const size = sectionSize(scheme, index, ordered.length - at)
    const units: Unit[] = []

    for (let taken = 0; taken < size && at < ordered.length;) {
      const unit: Unit = { index: units.length, circles: [] }
      for (let n = 0; n < UNIT_CIRCLES && taken < size && at < ordered.length; n++) {
        const rows = ordered.slice(at, Math.min(at + CIRCLE_WORDS, at + (size - taken)))
        unit.circles.push({
          index: circles++,
          words: rows.map((row) => row.headword),
          from: rows[0].rank,
          to: rows[rows.length - 1].rank,
        })
        at += rows.length
        taken += rows.length
      }
      units.push(unit)
    }

    sections.push({ index, name: scheme?.name(index), units })
  }

  return sections
}

/**
 * How many words section `index` holds.
 *
 * The scheme's last band takes everything left, however much that is: the sizes
 * are what a standard published, and a list that runs past them is a list with
 * a few hundred more words in it, not a list with an eighth exam level.
 */
function sectionSize(scheme: SectionScheme | undefined, index: number, left: number): number {
  if (!scheme) return PLAIN_SECTION_WORDS
  if (index >= scheme.sizes.length - 1) return left
  return scheme.sizes[index]
}

export type CircleStatus =
  /** Not all its words are in the deck yet. Watching is what opens it. */
  | 'locked'
  /** Every word met, and at least one never taught. This is the one you can run. */
  | 'ready'
  /** Every word taught and answered at least once. Review owns them now. */
  | 'taken'
  /** Every word mature, by the same rule that stops the overlay annotating one. */
  | 'mastered'

export interface CircleState {
  status: CircleStatus
  /** How many of the circle's words are in the deck. */
  met: number
  /** The ones that are not — what "add from the dictionary" offers. */
  missing: string[]
}

/**
 * What a circle is worth right now, against the deck as it stands.
 *
 * `deck` is headword → card, which the caller builds once for the whole path
 * rather than this scanning the deck per circle: a thousand circles against a
 * thousand cards is a million comparisons, and the map makes it a thousand.
 */
export function circleState(circle: Circle, deck: ReadonlyMap<string, Item>): CircleState {
  const missing = circle.words.filter((word) => !deck.has(word))
  const met = circle.words.length - missing.length
  if (missing.length > 0) return { status: 'locked', met, missing }

  const items = circle.words.map((word) => deck.get(word)!)
  // Mastered first: every mastered circle is also a taken one, so the other
  // order would never reach it.
  if (items.every(isKnown)) return { status: 'mastered', met, missing }
  if (items.every((item) => item.introducedAt !== undefined)) {
    return { status: 'taken', met, missing }
  }
  return { status: 'ready', met, missing }
}

export interface Waiting {
  /** Captured words sitting in a circle that has not opened. */
  words: string[]
  /** The locked circle nearest to opening, and its state. */
  next?: { circle: Circle; state: CircleState }
}

/**
 * What you have collected that the path cannot use yet.
 *
 * Extracted rather than computed where it is drawn, because it is drawn twice —
 * the aside's waiting panel and the path's own "next up" — and two copies of a
 * rule this fiddly would be two copies nothing could test.
 *
 * "Nearest" is the most words met, earliest circle breaking the tie, and a
 * circle where you have met nothing is not a candidate: it is not near opening,
 * it is merely next. Video does not deal out frequency ranks evenly, so the
 * circle you are one word short of is very often not the next one on the path.
 */
export function waiting(sections: readonly Section[], deck: ReadonlyMap<string, Item>): Waiting {
  const words: string[] = []
  let next: Waiting['next']

  for (const section of sections) {
    for (const unit of section.units) {
      for (const circle of unit.circles) {
        const state = circleState(circle, deck)
        if (state.status !== 'locked' || state.met === 0) continue
        words.push(...circle.words.filter((word) => deck.has(word)))
        if (!next || state.met > next.state.met) next = { circle, state }
      }
    }
  }

  return { words, next }
}

/**
 * The tone a finished circle is tinted with, or null where there is none.
 *
 * The same idea as the session's tone bar, one level up: a circle you cleared
 * should carry something of what was in it rather than being one more mint
 * disc. `toneOf` is the per-word answer that bar already uses
 * (`dominantTone` in src/app/pinyin.tsx), so the two pictures agree about what
 * a word is filed under.
 *
 * Ties go to the lower tone, so the answer never depends on map order. A
 * language that marks no tone answers null and the circle is drawn in its
 * status colour, which loses nothing.
 */
export function circleTone(
  words: readonly string[],
  toneOf: (word: string) => number | null,
): number | null {
  const counts = new Map<number, number>()
  for (const word of words) {
    const tone = toneOf(word)
    if (tone !== null) counts.set(tone, (counts.get(tone) ?? 0) + 1)
  }

  let best: number | null = null
  let most = 0
  for (const [tone, count] of [...counts].sort((a, b) => a[0] - b[0])) {
    if (count > most) {
      best = tone
      most = count
    }
  }
  return best
}
