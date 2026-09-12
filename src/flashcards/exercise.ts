// What a card asks, and what it asks for.
//
// Three things have a say. The card's rung on the mastery ladder decides how
// demanding a question it has *earned*; the study mode picks among what that
// leaves; and the card's capabilities say what can actually be put on screen.
// This resolves all three into one exercise, and it is pure so the whole matrix
// can be tested without a screen.
//
// The rung is the outer one on purpose. A word met once yesterday cannot be
// asked to be produced however the setting is set — that is not a test of
// memory, it is a test of the last five minutes — and a word known for three
// months is still allowed the easy question, because unlocks accumulate and
// keeping recognition warm is part of what mixed mode is for. At the top it is
// asked to be *used*: blanked inside one of the real lines it was captured
// from, which is the only exercise here that reads a card's contexts past the
// most recent one.
//
// The rule that shapes everything here: a prompt must carry exactly one cue —
// the meaning, or the sound — and never zero. A blanked line with no cue is not
// a recall test, it is a guess, and no amount of scheduling makes a guess
// informative.
//
// That rule used to leave one card with nothing to ask: a line captured without
// a translation, on a machine with no voice. It was self-graded, because there
// was no cue to build a question around. There is one — the blanked word's own
// definition, printed beside the gap. The rule is therefore satisfied here
// rather than waived, and it still holds over every branch below: nothing in
// this module returns a prompt the reader could only guess at.
//
// With that path cued, nothing self-grades any more, and `Response` has no
// `reveal` in it.

import { levelOf } from './scheduler'
import type { Item, ReviewStyle, StudyMode } from './types'

/** What the question gives you. */
export type Cue =
  /** The characters themselves — recall what they mean. */
  | 'hanzi'
  /** The English gloss — produce the word. */
  | 'gloss'
  /** The English line — produce the sentence. */
  | 'translation'
  /** Only the audio, nothing on screen until you answer. */
  | 'audio'
  /**
   * The line with one word blanked, cued by that word's definition — and spoken
   * too, wherever a voice exists. Only when there is no translation to prompt
   * with, which makes it the last resort for every kind of card.
   */
  | 'cloze'
  /** A grammar pattern's shape — recall what it does, or build a line with it. */
  | 'pattern'

/** What the question wants back. */
export type Response =
  /** Type the characters. */
  | 'text'
  /** Tap tiles into order. */
  | 'tiles'
  /** Pick the meaning out of several. The app grades it. */
  | 'choice'

export interface Exercise {
  /** Logged on the review, so recognition and production stay separable later. */
  style: ReviewStyle
  cue: Cue
  response: Response
  /** Whether the prompt speaks itself. The audio *is* the question, so it cannot wait for a button. */
  autoSpeak: boolean
}

/** What a card is capable of being asked. */
export interface Capability {
  /** A Mandarin voice exists on this machine. */
  canSpeak: boolean
  /** The card carries a translation — captured lines do not always have one. */
  hasTranslation: boolean
  /**
   * A word in the card's line can be blanked. See `chooseTarget`, and
   * `fallbackTarget` for the relaxed pick the cued cloze is allowed to make.
   *
   * The card's line, not the card's text: a word card blanks its own headword
   * inside the sentence it was met in, and a grammar card blanks a word of its
   * example. False only for a card carrying no line at all.
   */
  hasTarget: boolean
  /**
   * The session resolved an option set for this card — see
   * `src/app/review/options.ts`.
   *
   * False wherever there is no correct option to offer, which is a different
   * thing for each kind: a headword the dictionary cannot gloss, a line
   * captured with no translation, a pattern the language pack has since
   * dropped. All three used to end in self-grading; all three now fall to the
   * cued cloze, which asks a real question of a card whose own meaning nobody
   * can state.
   */
  hasChoices: boolean
}

/**
 * How demanding a question a card has earned.
 *
 * Tiers accumulate: a card at the top is allowed everything below it, so a
 * word you have known for three months can still come up as a quick multiple
 * choice. That is deliberate — dropping recognition once production unlocks
 * would make every sitting uniformly hard and would stop keeping the easy
 * reading warm.
 */
export type Tier = 'recognition' | 'production' | 'contextual'

/**
 * The rung each tier unlocks at, on `LADDER` in scheduler.ts.
 *
 * L2 is the first rung whose interval (3 days) outlasts the sitting a card was
 * introduced in, which is the earliest point at which asking someone to
 * *produce* the word tests memory rather than short-term recall. L4 (16 days)
 * is where a card has been met often enough to have collected more than one
 * `Context` to be asked inside — see the contextual tier's own slice, which is
 * what reads them.
 */
const UNLOCKS: ReadonlyArray<readonly [Tier, number]> = [
  ['recognition', 0],
  ['production', 2],
  ['contextual', 4],
]

/**
 * What this card is allowed to be asked for.
 *
 * Reads the rung live rather than storing a tier on the item: `levelOf` derives
 * a level for cards written before the ladder existed, so a deck that predates
 * any of this lands in the right tier on sight with no migration. It also means
 * a lapse genuinely re-eases the next question — the card drops a rung, and the
 * tier it lost goes with it.
 */
export function tiersFor(item: Pick<Item, 'interval' | 'level'>): Tier[] {
  const level = levelOf(item)
  return UNLOCKS.filter(([, at]) => level >= at).map(([tier]) => tier)
}

/**
 * One angle a card can be met from.
 *
 * Not the same list as `StudyMode`, and that is the point: `context` is a
 * question the setting has no name for. The study mode is a preference the
 * reader expressed once; an ask is what this card, at this rung, is actually
 * put on screen as.
 */
export type Ask = 'remember' | 'type' | 'audio' | 'context'

/**
 * Every ask, the mode that reaches it and the tier that unlocks it.
 *
 * Order is the rotation order, so a mixed sitting alternates recognising a word
 * and using it rather than pairing the two hardest asks back to back.
 *
 * `audio` sits in the recognition tier because listening is not itself
 * production — below the production rung it asks you to pick what you heard
 * rather than to write it, which is what keeps audio-only study working on a
 * deck of new cards. See `exerciseFor`.
 *
 * `context` is reached by `type` rather than by a mode of its own, which is why
 * that mode rotates between two asks once a word is mature: producing a word in
 * isolation and producing it into a sentence you met it in are the same request
 * at two strengths, and the tier accumulating means the weaker one does not go
 * away.
 *
 * `kinds` is on `context` alone. A sentence card *is* its line and a pattern
 * card is asked to build one, so neither has a word to be met inside a sentence
 * — the contextual tier is a thing only a word card can do.
 */
const ASKS: ReadonlyArray<{
  ask: Ask
  mode: Exclude<StudyMode, 'mixed'>
  tier: Tier
  kinds?: ReadonlyArray<Item['kind']>
}> = [
  { ask: 'remember', mode: 'remember', tier: 'recognition' },
  { ask: 'type', mode: 'type', tier: 'production' },
  { ask: 'audio', mode: 'audio', tier: 'recognition' },
  { ask: 'context', mode: 'type', tier: 'contextual', kinds: ['word'] },
]

/** What `askFor` chooses between. */
type Asked = Pick<Item, 'reps' | 'interval' | 'level' | 'kind'>

/**
 * Which angle a card is met from.
 *
 * Two filters and a rotation. The rung says which asks the card has *earned*,
 * the mode says which of those the reader wants, and `reps` picks between what
 * is left — so a word is met from a different angle each sitting instead of the
 * same one three times running, and deterministically rather than at random.
 * Because the cards in any one session sit at different rep counts, that still
 * gives a varied session.
 *
 * A mode with nothing unlocked under it falls back to `remember` rather than
 * failing, the same way asking for audio on a machine with no voice already
 * did. That makes the rung the ceiling and the setting a choice underneath it:
 * `type` on a card below the production rung is a request the card cannot yet
 * answer. `remember` is unlocked at every rung and needs no hardware, so the
 * fallback pool is never empty.
 */
export function askFor(item: Asked, mode: StudyMode, canSpeak: boolean): Ask {
  const tiers = tiersFor(item)
  const unlocked = ASKS.filter(
    (a) =>
      tiers.includes(a.tier) &&
      (a.mode !== 'audio' || canSpeak) &&
      (a.kinds === undefined || a.kinds.includes(item.kind)),
  )
  const wanted = mode === 'mixed' ? unlocked : unlocked.filter((a) => a.mode === mode)
  const pool = wanted.length > 0 ? wanted : unlocked.filter((a) => a.mode === 'remember')
  return pool[item.reps % pool.length].ask
}

/**
 * Which of the card's captured lines the prompt is built from.
 *
 * An index rather than the `Context` itself, so this stays testable without
 * building one, and so the caller can read the same entry for the line, its
 * translation and its video.
 *
 * Everything but the contextual ask reads the most recent, which is what the
 * screen has always done. The contextual ask is the first thing in the app to
 * read any of the others: a word met across ten videos has nine lines that
 * nothing has ever shown, and rotating them off `reps` is what turns those into
 * questions. A card holding one context still answers with it — the same
 * sentence every time is a real sentence the word was met in, which is a weaker
 * version of this exercise rather than a broken one.
 */
export function contextFor(
  item: Asked & Pick<Item, 'contexts'>,
  mode: StudyMode,
  canSpeak: boolean,
): number {
  const last = item.contexts.length - 1
  if (last < 0) return 0
  if (askFor(item, mode, canSpeak) !== 'context') return last
  return item.reps % item.contexts.length
}

/**
 * The last resort, and the one branch that made this module worth arguing over.
 *
 * A blank on its own is a guess; a blank whose word is defined beside it is a
 * recall test. Spoken as well wherever there is a voice, which is a second way
 * into the same question rather than a second question.
 *
 * The one card that reaches here without a definition to print is a word the
 * dictionary cannot gloss, and that one is cued by the line it is blanked out
 * of: the sentence around the gap, and four words to put in it.
 */
function cloze(can: Capability): Exercise {
  return { style: 'cloze', cue: 'cloze', response: 'tiles', autoSpeak: can.canSpeak }
}

/**
 * The exercise for a card in a given mode.
 *
 * Degrades rather than refuses, and degrades all the way down: every kind ends
 * at the cued cloze, because every kind has a line — the sentence itself, the
 * sentence a word was met in, the example a pattern was found in. What each
 * kind loses on the way down is what it is missing, not the ability to be
 * asked.
 *
 * Two ceilings, and they are not the same thing. The rung says how demanding a
 * question the card has *earned* (`tiersFor`, then `askFor`); the capability
 * says what this card and this machine can actually put on screen. Degradation
 * goes below the unlocked tier and never above it.
 *
 * So the cued cloze is reached two different ways, and only one of them is the
 * contextual tier. A card that cannot be asked any other way falls to it at any
 * rung — that is the terminal fallback, and it is what let self-grading go. A
 * mature word is *sent* there by `ask === 'context'` with everything else still
 * available to it. The exercise is the same; what differs is which line it is
 * built from, and that is `contextFor`'s answer rather than this one's.
 */
export function exerciseFor(item: Item, mode: StudyMode, can: Capability): Exercise {
  const ask = askFor(item, mode, can.canSpeak)
  const producing = tiersFor(item).includes('production')

  // A pattern has no sound of its own — a skeleton is not a sentence — so the
  // audio rotation never reaches it and it is never spoken. In recall it asks
  // what the shape does; in production it gives you a translated example and the
  // shape, and asks you to build the line, which is the exercise a pattern is
  // for.
  if (item.kind === 'grammar') {
    // Production whenever recall is not on the table: either the card has
    // earned production and the mode asked for it, or the pattern has been
    // dropped from the language pack and there is no explanation left to offer
    // as the right answer. The second is degradation and ignores the rung — a
    // dropped pattern has no recognition question left to fall back to.
    const builds = (producing && ask !== 'remember') || !can.hasChoices
    if (builds && can.hasTranslation) {
      return { style: 'type', cue: 'pattern', response: 'tiles', autoSpeak: false }
    }
    // The shape, and four accounts of what it does — the other three are other
    // patterns, because that is what a pattern's alternatives are.
    if (can.hasChoices) {
      return { style: 'recognise', cue: 'pattern', response: 'choice', autoSpeak: false }
    }
    // A dropped pattern with no translated example either. The line it was
    // found in is still a line, and a line can still be clozed.
    if (can.hasTarget) return cloze(can)
    return orphan()
  }

  if (item.kind === 'word') {
    // The tier this whole ladder was built towards: the word blanked inside one
    // of the real lines it was captured from, cued by its own definition beside
    // the gap. `contextFor` chose which line; this only says that it is asked
    // for. A word the chosen line cannot be blanked out of falls through to the
    // production question below rather than down to recognition — the ask was
    // for production, and losing the sentence is not losing the rung.
    if (ask === 'context' && can.hasTarget) return cloze(can)

    if (ask === 'audio') {
      if (producing) return { style: 'audio', cue: 'audio', response: 'text', autoSpeak: true }
      // Heard, not yet written. Below the production rung the sound is still the
      // whole prompt — nothing is on screen until you answer — but the answer is
      // picked out of four meanings rather than typed, which is the listening
      // half of recognition. Logged as `audio`: what the card asked is what it
      // sounded like, and only the grading changed.
      if (can.hasChoices) {
        return { style: 'audio', cue: 'audio', response: 'choice', autoSpeak: true }
      }
      if (can.hasTarget) return cloze(can)
      return orphan()
    }
    // Both remaining questions are asked in the dictionary's words — one shows
    // the gloss, the other offers four of them — so a headword the dictionary
    // cannot gloss can be asked neither way.
    if (can.hasChoices) {
      // The meaning, and the word's own characters to lay back out. Tiles
      // rather than a text box because producing 学习 through an IME is a dozen
      // keystrokes and a candidate list, and the question is whether you know
      // the word — the typing escape is there for anyone who would rather type
      // it.
      // Only ever reached from the production rung up: `askFor` answers
      // `remember` for a card that has not earned `type` yet. `context` lands
      // here too when its line could not be blanked, which is the same request
      // without the sentence around it.
      if (ask === 'type' || ask === 'context') {
        return { style: 'type', cue: 'gloss', response: 'tiles', autoSpeak: false }
      }
      // The characters, and four meanings to choose between. The style logged
      // is still `recognise`: what the card asks has not changed, only who
      // decides whether the answer was right, and the review log is append-only
      // — rows written before this have to keep meaning what they meant.
      return { style: 'recognise', cue: 'hanzi', response: 'choice', autoSpeak: false }
    }
    // Blanked inside the sentence it was met in. The gap is the card's own
    // headword, so the review still grades the word the card is about, and the
    // line around it is what makes an ungloss-able word answerable at all.
    if (can.hasTarget) return cloze(can)
    return orphan()
  }

  if (ask === 'remember') {
    // The line, and four things it might mean. Same style logged as before —
    // what the card asks has not changed, only who decides whether the answer
    // was right.
    if (can.hasChoices)
      return { style: 'recognise', cue: 'hanzi', response: 'choice', autoSpeak: false }
    // Nothing right to offer, which for a line means no translation was ever
    // captured with it. That is the same shortfall the production path below
    // handles, so it is handled there rather than twice.
  }

  // Audio mode withholds the line entirely, so the sound is the only cue and
  // the translation is kept back for the answer.
  if (ask === 'audio' && can.canSpeak) {
    // The same split as a word's: below the production rung, hearing the line
    // asks what it meant rather than asking you to rebuild it.
    if (!producing && can.hasChoices) {
      return { style: 'audio', cue: 'audio', response: 'choice', autoSpeak: true }
    }
    return { style: 'audio', cue: 'audio', response: 'tiles', autoSpeak: true }
  }

  if (can.hasTranslation) {
    return { style: 'type', cue: 'translation', response: 'tiles', autoSpeak: false }
  }

  // No translation to prompt with, which used to be where a line ran out of
  // questions. The blanked word's definition is the cue now, whether or not
  // there is a voice to add to it.
  if (can.hasTarget) return cloze(can)

  return orphan()
}

/**
 * What is left for a card carrying no line, no translation and no options.
 *
 * Its own text, laid back out from a meaning the dictionary may not have —
 * which is the same question `type` mode asks a word, and is a poor one. It is
 * reachable only by a card whose stored contexts are empty, which is a data
 * fault rather than an exercise: a card is captured from a line, and one with
 * none was written by a version of this extension that no longer exists.
 */
function orphan(): Exercise {
  return { style: 'type', cue: 'gloss', response: 'tiles', autoSpeak: false }
}
