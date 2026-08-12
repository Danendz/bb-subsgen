import { describe, expect, test } from 'vitest'
import { isWaiting, progressView } from './progress'

const translated = (...indices: number[]) => (index: number) => indices.includes(index)

describe('isWaiting', () => {
  test('waiting when the cue on screen has no translation yet', () => {
    expect(isWaiting(4, translated(0, 1, 2))).toBe(true)
  })

  test('not waiting once the cue on screen is translated', () => {
    expect(isWaiting(1, translated(0, 1, 2))).toBe(false)
  })

  test('not waiting in the gap between cues', () => {
    // watchPlayback reports -1 with nothing on screen; there is no line for
    // the viewer to be missing, so the pill must not appear.
    expect(isWaiting(-1, translated())).toBe(false)
  })
})

describe('progressView', () => {
  test('shows the download whether or not a line is being waited on', () => {
    // The pack download blocks everything, so it is always worth reporting.
    const view = progressView({ phase: 'download', label: 'Русский', fraction: 0.61 }, false)
    expect(view).toEqual({ visible: true, text: 'Downloading Русский… 61%', fraction: 0.61 })
  })

  test('shows the pass while the on-screen line is still missing', () => {
    const view = progressView({ phase: 'pass', done: 120, total: 540 }, true)
    expect(view.visible).toBe(true)
    expect(view.text).toBe('Translating… 120 / 540')
    expect(view.fraction).toBeCloseTo(120 / 540)
  })

  test('hides the pass once the pass is ahead of the playhead', () => {
    // The whole point of playhead-first ordering: after a few seconds you are
    // no longer waiting, so a bar reporting background work is just clutter.
    expect(progressView({ phase: 'pass', done: 120, total: 540 }, false).visible).toBe(false)
  })

  test('hides the pass once every cue is done', () => {
    expect(progressView({ phase: 'pass', done: 540, total: 540 }, true).visible).toBe(false)
  })

  test('hides a pass over an empty track instead of dividing by zero', () => {
    const view = progressView({ phase: 'pass', done: 0, total: 0 }, true)
    expect(view.visible).toBe(false)
    expect(view.fraction).toBe(0)
  })

  test('shows nothing when idle', () => {
    expect(progressView({ phase: 'idle' }, true).visible).toBe(false)
  })
})
