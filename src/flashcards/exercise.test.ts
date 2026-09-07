import { describe, expect, test } from 'vitest'
import { exerciseFor, modeFor, type Capability } from './exercise'
import type { Item, StudyMode } from './types'

function make(partial: Partial<Item> & Pick<Item, 'kind' | 'text'>): Item {
  return {
    id: `${partial.kind === 'word' ? 'w' : 's'}:zh:${partial.text}`,
    lang: 'zh',
    state: 'new',
    interval: 0,
    ease: 2.5,
    due: 0,
    reps: 0,
    lapses: 0,
    createdAt: 0,
    contexts: [],
    ...partial,
  }
}

const word = (extra: Partial<Item> = {}) => make({ kind: 'word', text: '学习', ...extra })
const line = (extra: Partial<Item> = {}) =>
  make({ kind: 'sentence', text: '我今天很累。', ...extra })

const pattern = (extra: Partial<Item> = {}) =>
  make({ kind: 'grammar', text: 'V + 得 + how', patternId: 'de-complement', ...extra })

const able: Capability = {
  canSpeak: true,
  hasTranslation: true,
  hasTarget: true,
  hasChoices: true,
}

describe('modeFor', () => {
  test('a chosen mode is used as chosen', () => {
    for (const mode of ['remember', 'type', 'audio'] as const) {
      expect(modeFor(word(), mode, true)).toBe(mode)
    }
  })

  test('mixed rotates off the review count, not at random', () => {
    // A word met from a different angle each sitting, rather than the same one
    // three times running.
    const met = [0, 1, 2, 3, 4].map((reps) => modeFor(word({ reps }), 'mixed', true))
    expect(met).toEqual(['remember', 'type', 'audio', 'remember', 'type'])
  })

  test('with no voice, mixed rotates through what is left', () => {
    const met = [0, 1, 2, 3].map((reps) => modeFor(word({ reps }), 'mixed', false))
    expect(met).toEqual(['remember', 'type', 'remember', 'type'])
  })

  test('choosing audio on a machine with no voice falls back rather than failing', () => {
    expect(modeFor(word(), 'audio', false)).toBe('remember')
  })
})

describe('exerciseFor: word cards', () => {
  test('remembering shows the characters and asks you to pick what they mean', () => {
    expect(exerciseFor(word(), 'remember', able)).toMatchObject({
      style: 'recognise',
      cue: 'hanzi',
      response: 'choice',
    })
  })

  // A word the dictionary cannot gloss can be asked neither by showing its
  // meaning nor by offering four of them. Blanking it inside the sentence it
  // was met in is the question that survives, and the app grades it.
  test('a word the dictionary cannot gloss is blanked into its own sentence', () => {
    expect(exerciseFor(word(), 'remember', { ...able, hasChoices: false })).toMatchObject({
      style: 'cloze',
      cue: 'cloze',
      response: 'tiles',
    })
  })

  // Producing a word from its gloss needs a gloss. The same shortfall, so the
  // same answer — otherwise the prompt is the "(no definition)" placeholder and
  // the tiles are the whole question.
  test('producing one it cannot gloss is blanked too, rather than prompted with nothing', () => {
    expect(exerciseFor(word(), 'type', { ...able, hasChoices: false })).toMatchObject({
      cue: 'cloze',
    })
  })

  // The log is append-only: a row written before options existed says
  // `recognise`, and this card is asking the same question it always was.
  test('still logs a recognition review, so the history keeps meaning what it meant', () => {
    expect(exerciseFor(word(), 'remember', able).style).toBe('recognise')
  })

  test('producing one prompts with the gloss and takes tiles', () => {
    // Its own characters, to lay back out. A word through an IME is a dozen
    // keystrokes and a candidate list between you and every one of them, and
    // the question was never whether you can drive an input method.
    expect(exerciseFor(word(), 'type', able)).toMatchObject({
      style: 'type',
      cue: 'gloss',
      response: 'tiles',
    })
  })

  test('audio speaks itself, because the sound is the question', () => {
    const exercise = exerciseFor(word(), 'audio', able)
    expect(exercise.cue).toBe('audio')
    expect(exercise.autoSpeak).toBe(true)
  })
})

describe('exerciseFor: sentence cards', () => {
  test('remembering shows the line and asks you to pick what it means', () => {
    expect(exerciseFor(line(), 'remember', able)).toMatchObject({
      style: 'recognise',
      cue: 'hanzi',
      response: 'choice',
    })
  })

  // A line captured with no translation has no correct option to offer and
  // nothing to prompt a production question with either. It is asked as the
  // cued cloze, which is the exercise that replaced self-grading outright.
  test('a line with no translation is blanked and cued by the blanked word', () => {
    expect(
      exerciseFor(line(), 'remember', { ...able, hasChoices: false, hasTranslation: false }),
    ).toMatchObject({
      style: 'cloze',
      cue: 'cloze',
      response: 'tiles',
    })
  })

  // Options come from other cards' stored translations, so a deck of one line
  // has none to draw on. The line still has its own translation to prompt with.
  test('a lone translated line still asks for the line, options or no options', () => {
    expect(exerciseFor(line(), 'remember', { ...able, hasChoices: false })).toMatchObject({
      cue: 'translation',
      response: 'tiles',
    })
  })

  test('typing prompts with the translation and takes tiles', () => {
    expect(exerciseFor(line(), 'type', able)).toMatchObject({
      cue: 'translation',
      response: 'tiles',
    })
  })

  test('audio withholds the line so the sound is the only cue', () => {
    expect(exerciseFor(line(), 'audio', able)).toMatchObject({
      cue: 'audio',
      response: 'tiles',
      autoSpeak: true,
    })
  })
})

describe('every prompt carries a cue', () => {
  // The rule the whole module exists to keep: a blanked line with nothing to
  // constrain the answer is a guess, not a recall test.
  const modes: StudyMode[] = ['remember', 'type', 'audio', 'mixed']

  test('a line with no translation is blanked, and spoken as well when it can be', () => {
    const exercise = exerciseFor(line({ target: '累' }), 'type', {
      ...able,
      hasTranslation: false,
    })
    expect(exercise.cue).toBe('cloze')
    expect(exercise.autoSpeak).toBe(true)
    expect(exercise.style).toBe('cloze')
  })

  // The card this whole slice exists for. The blank used to need the spoken
  // line to be a fair question; it is the blanked word's definition that makes
  // it one, and that is on screen whether or not the machine has a voice.
  test('a line with neither translation nor voice is still asked, cued by the gloss', () => {
    const exercise = exerciseFor(line({ target: '累' }), 'type', {
      ...able,
      canSpeak: false,
      hasTranslation: false,
    })
    expect(exercise.cue).toBe('cloze')
    expect(exercise.autoSpeak).toBe(false)
  })

  // Nothing to blank means no line was ever captured with the card, which is a
  // deck written by a version of this extension that no longer exists.
  test('only a card with no line at all runs out of questions', () => {
    const exercise = exerciseFor(line(), 'type', {
      ...able,
      hasTranslation: false,
      hasTarget: false,
    })
    expect(exercise.cue).toBe('gloss')
  })

  test('no combination ever asks for production without a cue', () => {
    for (const kind of [word, line]) {
      for (const mode of modes) {
        for (const canSpeak of [true, false]) {
          for (const hasTranslation of [true, false]) {
            for (const hasTarget of [true, false]) {
              for (const hasChoices of [true, false]) {
                for (const reps of [0, 1, 2]) {
                  const exercise = exerciseFor(kind({ reps }), mode, {
                    canSpeak,
                    hasTranslation,
                    hasTarget,
                    hasChoices,
                  })

                  // A gloss prompt on a card the dictionary cannot gloss is
                  // the one uncued shape the module admits to, and it is only
                  // reachable with no line to blank either — the orphan branch,
                  // which no deck this version writes can produce.
                  if (exercise.cue === 'gloss' && !hasChoices) {
                    expect(hasTarget).toBe(false)
                    continue
                  }

                  const cued =
                    exercise.cue === 'gloss' ||
                    exercise.cue === 'translation' ||
                    // The characters are the cue, and the options are what
                    // makes picking between them a test rather than a guess.
                    exercise.response === 'choice' ||
                    (exercise.cue === 'audio' && canSpeak) ||
                    // The blanked word's definition, which is on screen with or
                    // without a voice to add to it.
                    (exercise.cue === 'cloze' && hasTarget)
                  expect(cued).toBe(true)
                }
              }
            }
          }
        }
      }
    }
  })
})

describe('grammar cards', () => {
  const modes: StudyMode[] = ['remember', 'type', 'audio', 'mixed']

  // A pattern card in recall mode shows the shape and asks what it does. The
  // answer is an understanding rather than a string, which is why it used to be
  // self-graded — four accounts of the shape are what make it checkable.
  test('asks you to pick what the shape does', () => {
    const exercise = exerciseFor(pattern(), 'remember', able)
    expect(exercise).toEqual({
      style: 'recognise',
      cue: 'pattern',
      response: 'choice',
      autoSpeak: false,
    })
  })

  // Nothing to name the shape with, so nothing to offer as the right answer.
  // The example it was found in is still a line, and building that line is the
  // question a pattern card was always for.
  test('a pattern the table has dropped asks for the line instead', () => {
    const exercise = exerciseFor(pattern(), 'remember', { ...able, hasChoices: false })
    expect(exercise).toMatchObject({ cue: 'pattern', response: 'tiles' })
  })

  test('and with no translated example either, it is blanked like any other line', () => {
    const exercise = exerciseFor(pattern(), 'remember', {
      ...able,
      hasChoices: false,
      hasTranslation: false,
    })
    expect(exercise.cue).toBe('cloze')
  })

  // In production mode the card has a real question: here is a translation and
  // here is the shape, now build the line. That is the exercise the pattern
  // exists for, and it reuses the tile bank wholesale.
  test('asks you to build a line that uses the shape', () => {
    const exercise = exerciseFor(pattern(), 'type', able)
    expect(exercise.cue).toBe('pattern')
    expect(exercise.response).toBe('tiles')
    expect(exercise.style).toBe('type')
  })

  // Without a translated example there is nothing to prompt production with —
  // the skeleton alone would be a guess, not a recall test.
  test('degrades to picking what it does when no example carries a translation', () => {
    const exercise = exerciseFor(pattern(), 'type', { ...able, hasTranslation: false })
    expect(exercise.cue).toBe('pattern')
    expect(exercise.response).toBe('choice')
  })

  test('never speaks a skeleton, which is not a sentence', () => {
    for (const mode of modes) {
      expect(exerciseFor(pattern(), mode, able).autoSpeak).toBe(false)
    }
  })
})
