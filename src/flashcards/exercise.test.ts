import { describe, expect, test } from 'vitest'
import { exerciseFor, modeFor, type Capability } from './exercise'
import type { Item, StudyMode } from './types'

function make(partial: Partial<Item> & Pick<Item, 'kind' | 'text'>): Item {
  return {
    id: `${partial.kind === 'word' ? 'w' : 's'}:${partial.text}`,
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
const line = (extra: Partial<Item> = {}) => make({ kind: 'sentence', text: '我今天很累。', ...extra })

const able: Capability = { canSpeak: true, hasTranslation: true, hasTarget: true }

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
  test('remembering shows the characters and asks you to recall', () => {
    expect(exerciseFor(word(), 'remember', able)).toMatchObject({
      style: 'recognise',
      cue: 'hanzi',
      response: 'reveal',
    })
  })

  test('typing prompts with the gloss and takes text', () => {
    // A single word through an IME is not the problem sentences have, so word
    // cards keep the keyboard.
    expect(exerciseFor(word(), 'type', able)).toMatchObject({
      cue: 'gloss',
      response: 'text',
    })
  })

  test('audio speaks itself, because the sound is the question', () => {
    const exercise = exerciseFor(word(), 'audio', able)
    expect(exercise.cue).toBe('audio')
    expect(exercise.autoSpeak).toBe(true)
  })
})

describe('exerciseFor: sentence cards', () => {
  test('remembering shows the line and asks for its meaning', () => {
    expect(exerciseFor(line(), 'remember', able)).toMatchObject({
      cue: 'hanzi',
      response: 'reveal',
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

  test('a line with no translation is cued by its audio instead', () => {
    const exercise = exerciseFor(line({ target: '累' }), 'type', {
      canSpeak: true,
      hasTranslation: false,
      hasTarget: true,
    })
    expect(exercise.cue).toBe('cloze')
    expect(exercise.autoSpeak).toBe(true)
    expect(exercise.style).toBe('cloze')
  })

  test('a line with neither translation nor voice stops being a production question', () => {
    // There is nothing left to prompt with, so asking the user to produce the
    // line would be asking them to guess it.
    const exercise = exerciseFor(line({ target: '累' }), 'type', {
      canSpeak: false,
      hasTranslation: false,
      hasTarget: true,
    })
    expect(exercise.response).toBe('reveal')
    expect(exercise.cue).toBe('hanzi')
  })

  test('a line with no translation and no blankable word degrades too', () => {
    const exercise = exerciseFor(line(), 'type', {
      canSpeak: true,
      hasTranslation: false,
      hasTarget: false,
    })
    expect(exercise.response).toBe('reveal')
  })

  test('no combination ever asks for production without a cue', () => {
    for (const kind of [word, line]) {
      for (const mode of modes) {
        for (const canSpeak of [true, false]) {
          for (const hasTranslation of [true, false]) {
            for (const hasTarget of [true, false]) {
              for (const reps of [0, 1, 2]) {
                const exercise = exerciseFor(kind({ reps }), mode, {
                  canSpeak,
                  hasTranslation,
                  hasTarget,
                })
                if (exercise.response === 'reveal') continue

                const cued =
                  exercise.cue === 'gloss' ||
                  exercise.cue === 'translation' ||
                  (exercise.cue === 'audio' && canSpeak) ||
                  (exercise.cue === 'cloze' && canSpeak && hasTarget)
                expect(cued).toBe(true)
              }
            }
          }
        }
      }
    }
  })
})
