// What a card asks, and what it asks for.
//
// The study mode says how you want to be questioned; the card says what it is
// able to ask. This resolves the two into one exercise, and it is pure so the
// whole matrix can be tested without a screen.
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

const ROTATION: ReadonlyArray<Exclude<StudyMode, 'mixed'>> = ['remember', 'type', 'audio']

/**
 * Which mode a card is met in.
 *
 * `mixed` rotates off the card's review count rather than choosing at random,
 * so a word is met from a different angle each sitting instead of the same one
 * three times running. Because the cards in any one session sit at different
 * rep counts, that still gives a varied session.
 */
export function modeFor(
  item: Pick<Item, 'reps'>,
  mode: StudyMode,
  canSpeak: boolean,
): Exclude<StudyMode, 'mixed'> {
  const available = canSpeak ? ROTATION : ROTATION.filter((m) => m !== 'audio')
  if (mode !== 'mixed') return mode === 'audio' && !canSpeak ? 'remember' : mode
  return available[item.reps % available.length]
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
 * Degrades rather than refuses, and now degrades all the way down: every kind
 * ends at the cued cloze, because every kind has a line — the sentence itself,
 * the sentence a word was met in, the example a pattern was found in. What each
 * kind loses on the way down is what it is missing, not the ability to be
 * asked.
 */
export function exerciseFor(item: Item, mode: StudyMode, can: Capability): Exercise {
  const resolved = modeFor(item, mode, can.canSpeak)

  // A pattern has no sound of its own — a skeleton is not a sentence — so the
  // audio rotation never reaches it and it is never spoken. In recall it asks
  // what the shape does; in production it gives you a translated example and the
  // shape, and asks you to build the line, which is the exercise a pattern is
  // for.
  if (item.kind === 'grammar') {
    // Production whenever recall is not on the table: either the mode asked for
    // it, or the pattern has been dropped from the language pack and there is
    // no explanation left to offer as the right answer.
    const producing = resolved !== 'remember' || !can.hasChoices
    if (producing && can.hasTranslation) {
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
    if (resolved === 'audio') {
      return { style: 'audio', cue: 'audio', response: 'text', autoSpeak: true }
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
      if (resolved === 'type') {
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

  if (resolved === 'remember') {
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
  if (resolved === 'audio' && can.canSpeak) {
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
