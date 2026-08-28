import { describe, expect, test } from 'vitest'
import { createLanes } from './lanes'
import { BUFFER_CUES } from './tier'

describe('createLanes', () => {
  /**
   * The reason `lang` is a parameter on every call and never held. A model batch
   * takes minutes, so one started before the switch lands after it — and filing
   * it under whatever the setting now says would put a Russian line under an
   * English one, silently.
   */
  test('a model batch landing after a language switch is filed but not shown', () => {
    const lanes = createLanes()
    lanes.nmt('en', 10, 'on-device English')

    lanes.llm('ru', [{ start: 10, text: 'модель' }])

    expect(lanes.shown('en', 10)).toEqual({ text: 'on-device English', source: 'nmt' })
    expect(lanes.countLlm('ru')).toBe(1)
    expect(lanes.countLlm('en')).toBe(0)
  })

  test('the gate, once open, does not close', () => {
    const lanes = createLanes()

    expect(lanes.latchOn('en', BUFFER_CUES)).toBe(true)
    // Seeking into a stretch the model has not reached must not make you earn
    // the switch a second time.
    expect(lanes.latchOn('en', 0)).toBe(false)
    lanes.nmt('en', 10, 'on-device')
    lanes.llm('en', [{ start: 10, text: 'model' }])
    expect(lanes.shown('en', 10)).toEqual({ text: 'model', source: 'llm' })
  })

  /** Only the call that opened it, so the caller knows to repaint the line up. */
  test('says it opened the gate once and not on every batch after', () => {
    const lanes = createLanes()

    expect(lanes.latchOn('en', BUFFER_CUES - 1)).toBe(false)
    expect(lanes.latchOn('en', BUFFER_CUES)).toBe(true)
    expect(lanes.latchOn('en', BUFFER_CUES)).toBe(false)
  })

  /** A card is read alone weeks later, so the gate's reason does not reach it. */
  test('a card takes the model line before the gate opens, where the screen does not', () => {
    const lanes = createLanes()
    lanes.nmt('en', 10, 'on-device')
    lanes.llm('en', [{ start: 10, text: 'model' }])

    expect(lanes.shown('en', 10)).toEqual({ text: 'on-device', source: 'nmt' })
    expect(lanes.card('en', 10)).toBe('model')
  })

  test('each language keeps its own pass, so switching back is instant', () => {
    const lanes = createLanes()
    lanes.nmt('en', 10, 'English')
    lanes.nmt('ru', 10, 'русский')

    expect(lanes.shown('en', 10).text).toBe('English')
    expect(lanes.shown('ru', 10).text).toBe('русский')
    expect(lanes.countNmt('en')).toBe(1)
  })

  test('asking about a language nothing has been filed under reports nothing', () => {
    const lanes = createLanes()

    expect(lanes.shown('en', 10)).toEqual({ text: '', source: null })
    expect(lanes.card('en', 10)).toBe('')
    expect(lanes.hasNmt('en', 10)).toBe(false)
    expect(lanes.hasLlm('en', 10)).toBe(false)
    expect(lanes.countNmt('en')).toBe(0)
  })

  /** A new video, never a new overlay — the mount closes over one instance. */
  test('clearing drops the gate as well as the text, so the next video re-earns it', () => {
    const lanes = createLanes()
    lanes.nmt('en', 10, 'on-device')
    lanes.llm('en', [{ start: 10, text: 'model' }])
    lanes.latchOn('en', BUFFER_CUES)

    lanes.clear()

    expect(lanes.countNmt('en')).toBe(0)
    expect(lanes.countLlm('en')).toBe(0)
    expect(lanes.latchOn('en', 0)).toBe(false)
    lanes.nmt('en', 10, 'again')
    lanes.llm('en', [{ start: 10, text: 'model again' }])
    expect(lanes.shown('en', 10).source).toBe('nmt')
  })

  test('a later batch corrects a line rather than being dropped as a duplicate', () => {
    const lanes = createLanes()
    lanes.llm('en', [{ start: 10, text: 'first' }])
    lanes.llm('en', [{ start: 10, text: 'second' }])

    expect(lanes.card('en', 10)).toBe('second')
    expect(lanes.countLlm('en')).toBe(1)
  })
})
