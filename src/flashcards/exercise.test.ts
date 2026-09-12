import { describe, expect, test } from 'vitest'
import { exerciseFor, modeFor, tiersFor, type Capability } from './exercise'
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
    // Above the production rung by default. The gate is the subject of its own
    // block below; everywhere else the card being asked has earned the question
    // and what is under test is the matrix.
    level: 3,
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

  // The setting is a choice among what the card has earned, not an override of
  // it: asking a word met once yesterday to be produced tests the last five
  // minutes rather than memory.
  test('asking to produce a card that has not earned it falls back rather than failing', () => {
    expect(modeFor(word({ level: 0 }), 'type', true)).toBe('remember')
    expect(modeFor(word({ level: 1 }), 'type', true)).toBe('remember')
    expect(modeFor(word({ level: 2 }), 'type', true)).toBe('type')
  })

  // Listening is not production — below the production rung it asks you to pick
  // what you heard — so audio-only study keeps working on a deck of new cards
  // rather than going silent.
  test('audio-only study still listens at every rung', () => {
    for (const level of [0, 1, 2, 6]) {
      expect(modeFor(word({ level }), 'audio', true)).toBe('audio')
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

  // A fresh card rotates between recognising it and hearing it, and never
  // reaches the third. Deterministic off `reps` at every rung, not just the top.
  test('mixed rotates only over what a fresh card has unlocked', () => {
    const met = [0, 1, 2, 3].map((reps) => modeFor(word({ reps, level: 0 }), 'mixed', true))
    expect(met).toEqual(['remember', 'audio', 'remember', 'audio'])
  })

  // The rotation widens at the threshold and nowhere either side of it.
  test('production joins the rotation at the third rung, and not before', () => {
    const modes = (level: number) =>
      [0, 1, 2].map((reps) => modeFor(word({ reps, level }), 'mixed', true))
    expect(modes(1)).toEqual(['remember', 'audio', 'remember'])
    expect(modes(2)).toEqual(['remember', 'type', 'audio'])
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
                for (const [reps, level] of [
                  [0, 0],
                  [1, 1],
                  [2, 2],
                  [0, 4],
                  [1, 6],
                ]) {
                  const exercise = exerciseFor(kind({ reps, level }), mode, {
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

describe('tiersFor', () => {
  // Nothing is stored and nothing is migrated: a deck written before the ladder
  // existed carries an interval and no level, and `levelOf` reads a rung off it.
  test('a card with no level lands in the tier its earned interval says', () => {
    expect(tiersFor({ interval: 0 })).toEqual(['recognition'])
    expect(tiersFor({ interval: 3 })).toEqual(['recognition', 'production'])
    expect(tiersFor({ interval: 16 })).toEqual(['recognition', 'production', 'contextual'])
  })

  test('unlocks accumulate — reaching a tier removes nothing below it', () => {
    expect(tiersFor({ interval: 0, level: 6 })).toEqual(['recognition', 'production', 'contextual'])
  })

  test('production unlocks at the third rung, and contextual at the fifth', () => {
    const at = (level: number) => tiersFor({ interval: 0, level })
    expect(at(1)).toEqual(['recognition'])
    expect(at(2)).toContain('production')
    expect(at(3)).not.toContain('contextual')
    expect(at(4)).toContain('contextual')
  })
})

describe('the rung decides what a card may be asked', () => {
  // The whole point of the gate. A word introduced this sitting is shown its
  // characters and four meanings, whatever the setting says.
  test('a newly introduced word is only asked to recognise it', () => {
    for (const mode of ['remember', 'type', 'mixed'] as const) {
      expect(exerciseFor(word({ level: 0 }), mode, able)).toMatchObject({
        style: 'recognise',
        cue: 'hanzi',
        response: 'choice',
      })
    }
  })

  // Hearing a word you have met once and picking what it meant, rather than
  // being asked to write it. Still the sound as the only prompt, still logged
  // as an audio review — only the answer got easier.
  test('a fresh word in audio mode asks what it heard, not for it to be written', () => {
    expect(exerciseFor(word({ level: 0 }), 'audio', able)).toEqual({
      style: 'audio',
      cue: 'audio',
      response: 'choice',
      autoSpeak: true,
    })
  })

  test('and writes it once production is unlocked', () => {
    expect(exerciseFor(word({ level: 2 }), 'audio', able)).toEqual({
      style: 'audio',
      cue: 'audio',
      response: 'text',
      autoSpeak: true,
    })
  })

  test('a fresh line in audio mode picks what it meant rather than rebuilding it', () => {
    expect(exerciseFor(line({ level: 0 }), 'audio', able)).toMatchObject({
      cue: 'audio',
      response: 'choice',
    })
    expect(exerciseFor(line({ level: 2 }), 'audio', able)).toMatchObject({
      cue: 'audio',
      response: 'tiles',
    })
  })

  // A pattern is never spoken, so mixed's audio slot lands on it as a mode with
  // no sound. It must not become the production question by default.
  test('a fresh pattern is asked what the shape does, in every mode', () => {
    for (const mode of ['remember', 'type', 'audio', 'mixed'] as const) {
      expect(exerciseFor(pattern({ level: 0 }), mode, able)).toMatchObject({
        cue: 'pattern',
        response: 'choice',
      })
    }
  })

  // Accumulation, seen from the other end: the easy question is still reachable
  // at the top of the ladder, which is what keeps recognition warm.
  test('a card at the top of the ladder still meets recognition under mixed', () => {
    const met = [0, 1, 2].map((reps) => exerciseFor(word({ reps, level: 6 }), 'mixed', able))
    expect(met.map((e) => e.response)).toEqual(['choice', 'tiles', 'text'])
  })

  // Dropping a rung has to genuinely re-ease the next question, or a lapse is
  // only a date change. Read live off the level, so it takes effect on sight.
  test('lapsing back below the threshold re-eases the next question', () => {
    expect(exerciseFor(word({ level: 2 }), 'type', able)).toMatchObject({ response: 'tiles' })
    expect(exerciseFor(word({ level: 1 }), 'type', able)).toMatchObject({ response: 'choice' })
  })

  // Capability degradation applies underneath the unlocked set, and may go
  // below it: a fresh word the dictionary cannot gloss has no recognition
  // question to ask, so it falls to the cued cloze rather than to nothing.
  test('a fresh card with no options still degrades below its tier rather than refusing', () => {
    expect(
      exerciseFor(word({ level: 0 }), 'remember', { ...able, hasChoices: false }),
    ).toMatchObject({ cue: 'cloze' })
    expect(exerciseFor(word({ level: 0 }), 'audio', { ...able, hasChoices: false })).toMatchObject({
      cue: 'cloze',
    })
  })
})
