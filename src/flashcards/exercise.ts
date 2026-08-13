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
  /** The line with one word blanked, plus its audio. Only when there is no translation. */
  | 'cloze'

/** What the question wants back. */
export type Response =
  /** Recall it in your head, then reveal. Nothing to check, so you say how it went. */
  | 'reveal'
  /** Type the characters. */
  | 'text'
  /** Tap tiles into order. */
  | 'tiles'

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
  /** A word in the line can be blanked. See `chooseTarget`. */
  hasTarget: boolean
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
export function modeFor(item: Pick<Item, 'reps'>, mode: StudyMode, canSpeak: boolean): Exclude<StudyMode, 'mixed'> {
  const available = canSpeak ? ROTATION : ROTATION.filter((m) => m !== 'audio')
  if (mode !== 'mixed') return mode === 'audio' && !canSpeak ? 'remember' : mode
  return available[item.reps % available.length]
}

/**
 * The exercise for a card in a given mode.
 *
 * Degrades rather than refuses. A production mode needs something to prompt
 * with: the translation first, then the blank-plus-audio, and if the card has
 * neither it becomes a recall question, which is the only honest thing left to
 * ask of a line nobody can cue.
 */
export function exerciseFor(item: Item, mode: StudyMode, can: Capability): Exercise {
  const resolved = modeFor(item, mode, can.canSpeak)

  if (item.kind === 'word') {
    if (resolved === 'type') return { style: 'type', cue: 'gloss', response: 'text', autoSpeak: false }
    if (resolved === 'audio') return { style: 'audio', cue: 'audio', response: 'text', autoSpeak: true }
    return { style: 'recognise', cue: 'hanzi', response: 'reveal', autoSpeak: false }
  }

  if (resolved === 'remember') {
    return { style: 'recognise', cue: 'hanzi', response: 'reveal', autoSpeak: false }
  }

  // Audio mode withholds the line entirely, so the sound is the only cue and
  // the translation is kept back for the reveal.
  if (resolved === 'audio' && can.canSpeak) {
    return { style: 'audio', cue: 'audio', response: 'tiles', autoSpeak: true }
  }

  if (can.hasTranslation) {
    return { style: 'type', cue: 'translation', response: 'tiles', autoSpeak: false }
  }

  // No translation to prompt with. The blank plus the spoken line is a real
  // cue; the blank on its own is not, so without a voice this stops being a
  // production question at all.
  if (can.hasTarget && can.canSpeak) {
    return { style: 'cloze', cue: 'cloze', response: 'tiles', autoSpeak: true }
  }

  return { style: 'recognise', cue: 'hanzi', response: 'reveal', autoSpeak: false }
}
