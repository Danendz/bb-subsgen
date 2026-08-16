import { describe, expect, test } from 'vitest'
import { modelLabel, passProgressView, transcriptProgressView } from './progress'

describe('modelLabel', () => {
  test('drops the publisher namespace runners prefix ids with', () => {
    expect(modelLabel('qwen/qwen3.6-35b-a3b')).toBe('qwen3.6-35b-a3b')
    expect(modelLabel('google/gemma-4-e4b')).toBe('gemma-4-e4b')
  })

  test('leaves an unnamespaced id alone', () => {
    expect(modelLabel('gemma-4-e4b')).toBe('gemma-4-e4b')
  })

  // Ollama tags carry a colon rather than a slash, and the tag is meaningful —
  // it is the quantization — so it stays.
  test('keeps a tag', () => {
    expect(modelLabel('qwen3:8b-q4_K_M')).toBe('qwen3:8b-q4_K_M')
  })

  test('does not reduce a trailing slash to nothing', () => {
    expect(modelLabel('weird/')).toBe('weird/')
  })
})

describe('passProgressView', () => {
  const base = { model: 'qwen/qwen3.6-35b-a3b', translated: 312, total: 840 }

  test('names the model and counts the lines', () => {
    const view = passProgressView(base)

    expect(view.label).toBe('Translating with qwen3.6-35b-a3b')
    expect(view.count).toBe('312 / 840 lines')
    expect(view.fraction).toBeCloseTo(312 / 840)
  })

  test('starts at zero rather than empty', () => {
    expect(passProgressView({ ...base, translated: 0 }).count).toBe('0 / 840 lines')
    expect(passProgressView({ ...base, translated: 0 }).fraction).toBe(0)
  })

  // A track of nothing but blank cues, which is rare but not impossible.
  test('a track with nothing to translate is 0 rather than NaN', () => {
    const view = passProgressView({ ...base, translated: 0, total: 0 })

    expect(view.fraction).toBe(0)
    expect(Number.isNaN(view.fraction)).toBe(false)
  })

  // A retry can re-answer an accepted line; the bar must not overrun its track.
  test('never reports more than a full bar', () => {
    expect(passProgressView({ ...base, translated: 900, total: 840 }).fraction).toBe(1)
  })
})

describe('transcriptProgressView', () => {
  const running = { model: 'large-v3-turbo-q8_0', done: 3, total: 10, failed: 0, running: true }

  test('counts chunks while a run is going', () => {
    const view = transcriptProgressView(running)
    expect(view).toMatchObject({
      label: 'Transcribing with large-v3-turbo-q8_0',
      count: '3 / 10 chunks',
      stopped: false,
    })
    expect(view.fraction).toBeCloseTo(0.3)
  })

  test('says so before the chunk plan comes back', () => {
    // The plan takes as long as the fetch and the decode, and "0 / 0" reads as
    // a run that has nothing to do.
    expect(transcriptProgressView({ ...running, done: 0, total: 0 })).toMatchObject({
      count: 'starting…',
      fraction: 0,
    })
  })

  test('reports how much of the episode has no lines when it stopped', () => {
    // Stretches, not chunks: what matters is how much you cannot read, not how
    // the work happened to be divided.
    const view = transcriptProgressView({
      ...running,
      done: 9,
      failed: 1,
      running: false,
      error: 'Could not reach the model server at http://localhost:8080/v1.',
    })
    expect(view).toMatchObject({
      label: 'Transcription stopped',
      count: '1 stretch missing',
      stopped: true,
      detail: 'Could not reach the model server at http://localhost:8080/v1.',
    })
  })

  test('pluralises the stretches', () => {
    expect(
      transcriptProgressView({ ...running, done: 7, failed: 3, running: false }).count,
    ).toBe('3 stretches missing')
  })

  test('covers a run that never produced anything', () => {
    // The decoder failing, or no audio stream: nothing was divided up, so there
    // are no stretches to count.
    expect(
      transcriptProgressView({ ...running, done: 0, total: 0, failed: 0, running: false }),
    ).toMatchObject({ count: 'nothing was transcribed', fraction: 0 })
  })
})
