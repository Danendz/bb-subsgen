import { describe, expect, test } from 'vitest'
import { covers, isWaiting, progressView, type Watching } from './progress'

const translated = (...indices: number[]) => (index: number) => indices.includes(index)

/** Watching from the top of the video, with the line on screen translated. */
const at = (playhead: number, waiting = false): Watching => ({ waiting, playhead })

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

describe('covers', () => {
  test('finds the stretch the playhead is in', () => {
    expect(covers([[0, 60], [600, 900]], 42)).toBe(true)
    expect(covers([[0, 60], [600, 900]], 700)).toBe(true)
  })

  test('does not find one that has not been transcribed', () => {
    expect(covers([[0, 60], [600, 900]], 300)).toBe(false)
    expect(covers([], 0)).toBe(false)
  })

  test('takes the start as inclusive and the end as exclusive', () => {
    expect(covers([[0, 60]], 0)).toBe(true)
    expect(covers([[0, 60]], 60)).toBe(false)
  })
})

describe('progressView', () => {
  test('shows the download whether or not a line is being waited on', () => {
    // The pack download blocks everything, so it is always worth reporting.
    const view = progressView({ phase: 'download', label: 'Русский', fraction: 0.61 }, at(0))
    expect(view).toEqual({ visible: true, text: 'Downloading Русский… 61%', fraction: 0.61 })
  })

  test('shows the pass while the on-screen line is still missing', () => {
    const view = progressView({ phase: 'pass', done: 120, total: 540 }, at(0, true))
    expect(view.visible).toBe(true)
    expect(view.text).toBe('Translating… 120 / 540')
    expect(view.fraction).toBeCloseTo(120 / 540)
  })

  test('hides the pass once the pass is ahead of the playhead', () => {
    // The whole point of playhead-first ordering: after a few seconds you are
    // no longer waiting, so a bar reporting background work is just clutter.
    expect(progressView({ phase: 'pass', done: 120, total: 540 }, at(0)).visible).toBe(false)
  })

  test('hides the pass once every cue is done', () => {
    expect(progressView({ phase: 'pass', done: 540, total: 540 }, at(0, true)).visible).toBe(false)
  })

  test('hides a pass over an empty track instead of dividing by zero', () => {
    const view = progressView({ phase: 'pass', done: 0, total: 0 }, at(0, true))
    expect(view.visible).toBe(false)
    expect(view.fraction).toBe(0)
  })

  test('shows nothing when idle', () => {
    expect(progressView({ phase: 'idle' }, at(0, true)).visible).toBe(false)
  })

  test('shows the transcript while the stretch being watched has no lines yet', () => {
    const view = progressView(
      { phase: 'transcribe', done: 2, total: 11, covered: [[0, 60]] },
      at(700),
    )
    expect(view.visible).toBe(true)
    expect(view.text).toBe('Transcribing… 2 / 11')
    expect(view.fraction).toBeCloseTo(2 / 11)
  })

  test('hides the transcript once the stretch being watched has lines', () => {
    // Chunks are transcribed playhead-first, so within a chunk of joining you
    // are reading — and the rest of the run is not something you are waiting on.
    const view = progressView(
      { phase: 'transcribe', done: 2, total: 11, covered: [[0, 60], [60, 360]] },
      at(42),
    )
    expect(view.visible).toBe(false)
  })

  test('shows it again when you seek past what has been transcribed', () => {
    const view = progressView(
      { phase: 'transcribe', done: 2, total: 11, covered: [[0, 60], [60, 360]] },
      at(1800),
    )
    expect(view.visible).toBe(true)
  })

  test('stays hidden over a silent stretch inside a finished chunk', () => {
    // The reason coverage comes from the chunk plan and not from the cues: a
    // minute of no narration is transcribed correctly and produces nothing, and
    // guessing from nearby cues would put the bar back over the video.
    const view = progressView(
      { phase: 'transcribe', done: 1, total: 11, covered: [[0, 300]] },
      at(280),
    )
    expect(view.visible).toBe(false)
  })

  test('shows the transcript without a count before the plan is known', () => {
    // The chunk count comes back with the first progress report, so there is a
    // gap where the only honest thing to say is that it has started.
    const view = progressView({ phase: 'transcribe', done: 0, total: 0, covered: [] }, at(0, true))
    expect(view.visible).toBe(true)
    expect(view.text).toBe('Transcribing…')
    expect(view.fraction).toBe(0)
  })

  test('still shows the transcript on its last chunk, where the gap is', () => {
    // The pass hides itself once done meets total; this must not, because the
    // one stretch left is precisely the one being waited on.
    const view = progressView(
      { phase: 'transcribe', done: 10, total: 11, covered: [[0, 3000]] },
      at(3100),
    )
    expect(view.visible).toBe(true)
  })
})
