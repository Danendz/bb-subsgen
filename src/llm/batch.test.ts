import { describe, expect, test } from 'vitest'
import {
  batchSystem,
  batchUser,
  BATCH_SCHEMA,
  pickBatch,
  planBatches,
  reconcile,
  type BatchLine,
} from './batch'

function lines(...pairs: Array<[number, string]>): BatchLine[] {
  return pairs.map(([id, zh]) => ({ id, zh }))
}

describe('planBatches', () => {
  test('groups in track order', () => {
    const batches = planBatches(['一', '二', '三', '四', '五'], 2)

    expect(batches.map((b) => b.map((l) => l.zh))).toEqual([['一', '二'], ['三', '四'], ['五']])
  })

  // The id is the cue's index in the track, and stays that even when blanks
  // mean the batch is not a contiguous run.
  test('ids are track indices, not positions in the batch', () => {
    const batches = planBatches(['一', '', '三', '四'], 2)

    expect(batches[0].map((l) => l.id)).toEqual([0, 2])
    expect(batches[1].map((l) => l.id)).toEqual([3])
  })

  test('leaves blank cues out', () => {
    expect(planBatches(['一', '', '   ', '四']).flat().map((l) => l.zh)).toEqual(['一', '四'])
  })

  test('a track of nothing plans nothing', () => {
    expect(planBatches(['', '  '])).toEqual([])
  })

  test('a track shorter than a batch is one batch', () => {
    expect(planBatches(['一', '二'], 25)).toHaveLength(1)
  })
})

describe('pickBatch', () => {
  const pending = [lines([0, 'a'], [1, 'b']), lines([2, 'c'], [3, 'd']), lines([4, 'e'])]

  test('takes the batch containing the playhead', () => {
    expect(pickBatch(pending, 3)).toBe(1)
  })

  test('takes the first batch when the playhead is before the track', () => {
    expect(pickBatch(pending, -1)).toBe(0)
  })

  // Seeking forward should not make you wait for everything behind you.
  test('skips ahead when the playhead has moved past earlier batches', () => {
    expect(pickBatch([pending[0], pending[2]], 4)).toBe(1)
  })

  // Everything ahead is done, so go back and fill in what was skipped.
  test('wraps to what is left behind when nothing is ahead', () => {
    expect(pickBatch([pending[0]], 10)).toBe(0)
  })

  test('is null when there is nothing left', () => {
    expect(pickBatch([], 0)).toBeNull()
  })
})

describe('reconcile', () => {
  const sent = lines([0, '你好'], [1, '我吃了饭'], [2, '再见'])

  test('matches a complete reply', () => {
    const { accepted, missing } = reconcile(sent, {
      lines: [
        { id: 0, zh: '你好', en: 'Hello' },
        { id: 1, zh: '我吃了饭', en: 'I ate' },
        { id: 2, zh: '再见', en: 'Bye' },
      ],
    })

    expect(Object.fromEntries(accepted)).toEqual({ 0: 'Hello', 1: 'I ate', 2: 'Bye' })
    expect(missing).toEqual([])
  })

  // The failure this whole mechanism exists for.
  test('reports lines the model skipped', () => {
    const { accepted, missing } = reconcile(sent, {
      lines: [
        { id: 0, zh: '你好', en: 'Hello' },
        { id: 2, zh: '再见', en: 'Bye' },
      ],
    })

    expect(accepted.size).toBe(2)
    expect(missing).toEqual([1])
  })

  // A model that drops a line and renumbers the rest produces valid ids on the
  // wrong content. The echo is the only thing that catches it.
  test('rejects an entry whose Chinese does not match the id it claims', () => {
    const { accepted, missing } = reconcile(sent, {
      lines: [
        { id: 0, zh: '你好', en: 'Hello' },
        { id: 1, zh: '再见', en: 'Bye' },
      ],
    })

    expect(accepted.get(1)).toBeUndefined()
    expect(missing).toEqual([1, 2])
  })

  test('accepts an entry that left the echo out', () => {
    const { accepted } = reconcile(sent, { lines: [{ id: 1, en: 'I ate' }] })

    expect(accepted.get(1)).toBe('I ate')
  })

  test('tolerates an id that came back as a string', () => {
    const { accepted } = reconcile(sent, { lines: [{ id: '1', zh: '我吃了饭', en: 'I ate' }] })

    expect(accepted.get(1)).toBe('I ate')
  })

  test('ignores ids that were never sent', () => {
    const { accepted } = reconcile(sent, { lines: [{ id: 99, en: 'from nowhere' }] })

    expect(accepted.size).toBe(0)
  })

  test('ignores an empty translation rather than accepting a blank line', () => {
    const { accepted, missing } = reconcile(sent, { lines: [{ id: 0, en: '   ' }] })

    expect(accepted.size).toBe(0)
    expect(missing).toEqual([0, 1, 2])
  })

  test('the first answer for an id stands', () => {
    const { accepted } = reconcile(sent, {
      lines: [
        { id: 0, en: 'Hello' },
        { id: 0, en: 'Hi again' },
      ],
    })

    expect(accepted.get(0)).toBe('Hello')
  })

  test('takes a bare array', () => {
    const { accepted } = reconcile(sent, [{ id: 0, en: 'Hello' }])

    expect(accepted.get(0)).toBe('Hello')
  })

  test('takes the array under whatever noun the model chose', () => {
    expect(reconcile(sent, { translations: [{ id: 0, en: 'Hello' }] }).accepted.size).toBe(1)
    expect(reconcile(sent, { results: [{ id: 0, en: 'Hello' }] }).accepted.size).toBe(1)
  })

  test('a reply that is nothing at all loses the whole batch, not the pass', () => {
    expect(reconcile(sent, null).missing).toEqual([0, 1, 2])
    expect(reconcile(sent, { nothing: true }).missing).toEqual([0, 1, 2])
  })

  test('reads the translation from the schema’s own field', () => {
    const { accepted } = reconcile(sent, { lines: [{ id: 0, zh: '你好', text: 'Привет' }] })

    expect(accepted.get(0)).toBe('Привет')
  })

  // The schema is a request, not a guarantee, and `en` is what a model reaches
  // for unprompted. Dropping those lines would be a worse failure than the
  // field name being untidy.
  test('still accepts a model that answers in `en` regardless', () => {
    const { accepted } = reconcile(sent, { lines: [{ id: 0, zh: '你好', en: 'Hello' }] })

    expect(accepted.get(0)).toBe('Hello')
  })

  test('prefers the field that was actually asked for', () => {
    const { accepted } = reconcile(sent, {
      lines: [{ id: 0, zh: '你好', text: 'Привет', en: 'Hello' }],
    })

    expect(accepted.get(0)).toBe('Привет')
  })
})

describe('the prompts', () => {
  const base = { lines: lines([0, '你好'], [1, '再见']), lang: 'en' as const }

  test('name the target language', () => {
    expect(batchSystem(base)).toContain('English')
    expect(batchSystem({ ...base, lang: 'ru' })).toContain('Russian')
  })

  // The instruction that the id mechanism depends on being followed.
  test('forbid merging, splitting and dropping', () => {
    const system = batchSystem(base)

    expect(system).toContain('Never merge')
    expect(system).toContain('never split')
    expect(system).toContain('never leave a line out')
  })

  // Russian has to commit to a gender on every past-tense verb and short
  // adjective; Chinese states one nowhere and English asks for none. Only the
  // target that needs the rule should carry it.
  test('carry the gender-agreement rule for Russian and not for English', () => {
    const russian = batchSystem({ ...base, lang: 'ru' })

    expect(russian).toContain('Russian marks gender')
    expect(russian).toContain('老公')
    expect(batchSystem(base)).not.toContain('marks gender')
  })

  test('tell Russian to hedge rather than guess when nothing settles the gender', () => {
    expect(batchSystem({ ...base, lang: 'ru' })).toContain('does not force a choice')
  })

  test('repeat the agreement rule beside the lines, for Russian only', () => {
    expect(batchUser({ ...base, lang: 'ru' })).toContain('gender ending')
    expect(batchUser(base)).not.toContain('gender ending')
  })

  test('carry the video subject when it is known', () => {
    const system = batchSystem({ ...base, video: { title: '家常菜', description: '做饭' } })

    expect(system).toContain('家常菜')
    expect(system).toContain('做饭')
  })

  test('say nothing about a video that has no title', () => {
    expect(batchSystem(base)).not.toContain('titled')
  })

  test('the user turn pairs each line with its id', () => {
    const user = batchUser(base)

    expect(user).toContain('0\t你好')
    expect(user).toContain('1\t再见')
  })

  test('states how many entries are expected', () => {
    expect(batchUser(base)).toContain('Return exactly 2 entries')
  })

  // The system turn alone loses to a field name; saying it again next to the
  // lines themselves is the cheapest reinforcement available.
  test('the user turn names the target language too', () => {
    expect(batchUser(base)).toContain('English')
    expect(batchUser({ ...base, lang: 'ru' })).toContain('Russian')
  })

  test('carries the previous batch across the seam, marked not to be returned', () => {
    const user = batchUser({ ...base, seam: [{ zh: '你饿吗', en: 'Are you hungry?' }] })

    expect(user).toContain('你饿吗 → Are you hungry?')
    expect(user).toContain('do not return them')
  })

  test('carries the glossary', () => {
    const user = batchUser({
      ...base,
      glossary: [{ word: '了', pinyin: 'le5', gloss: 'completed action' }],
    })

    expect(user).toContain('了 (le5) — completed action')
  })

  test('leaves out the sections it has nothing for', () => {
    const user = batchUser(base)

    expect(user).not.toContain('Dictionary entries')
    expect(user).not.toContain('Already translated')
  })
})

describe('BATCH_SCHEMA', () => {
  test('requires an id on every entry, which is what makes reconciling possible', () => {
    const items = (BATCH_SCHEMA.json_schema.schema as any).properties.lines.items

    expect(items.required).toEqual(['id', 'zh', 'text'])
    expect(items.properties.id.type).toBe('integer')
  })

  /**
   * Verified against LM Studio: the same model, prompt and temperature, with
   * only this field's name changed, answers a "translate into Russian" request
   * in English when the field is called `en` and in Russian when it is not. The
   * field name outweighs the instruction, so it must not name a language.
   */
  test('does not name a language in the output field', () => {
    const items = (BATCH_SCHEMA.json_schema.schema as any).properties.lines.items

    expect(Object.keys(items.properties)).not.toContain('en')
  })
})
