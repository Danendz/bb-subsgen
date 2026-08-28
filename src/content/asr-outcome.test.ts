import { describe, expect, test } from 'vitest'
import { asrOutcome } from './asr-outcome'
import type { Span } from './progress'
import type { AsrCuesMessage } from '../shared/messages'

const msg = (over: Partial<AsrCuesMessage> = {}): AsrCuesMessage => ({
  type: 'bb-subsgen:asr-cues',
  videoId: 'BV1',
  cues: [],
  done: 1,
  total: 4,
  complete: false,
  ...over,
})

const covered: Span[] = [[0, 300]]

describe('asrOutcome', () => {
  /**
   * A retry re-fetches and re-decodes before it can say anything. Defaulting to
   * empty here would blanket a video that already has forty-five minutes of
   * subtitles for the half-minute that takes.
   */
  test('a chunk with no coverage of its own keeps the last one', () => {
    const outcome = asrOutcome(msg(), covered)

    expect(outcome.covered).toEqual(covered)
    expect(outcome.transcribeState).toEqual({ done: 1, total: 4, covered })
  })

  test('a chunk that names its coverage replaces the carried one', () => {
    const fresh: Span[] = [
      [0, 300],
      [600, 900],
    ]
    const outcome = asrOutcome(msg({ covered: fresh }), covered)

    expect(outcome.covered).toEqual(fresh)
    expect(outcome.transcribeState).toEqual({ done: 1, total: 4, covered: fresh })
  })

  test('a chunk holds the worker open and leaves the model pass waiting', () => {
    const outcome = asrOutcome(msg(), covered)

    expect(outcome.releasePort).toBe(false)
    // One GPU: the speech server has it until the last chunk lands.
    expect(outcome.startLlm).toBe(false)
    expect(outcome.notice).toBeNull()
  })

  /**
   * Both ways a run can end. A pill left up has nothing coming that would ever
   * clear it, so it would sit over the video for the rest of the session.
   */
  test('the pill clears on completion whether the run worked or failed', () => {
    expect(asrOutcome(msg({ complete: true }), covered).transcribeState).toBeNull()
    expect(
      asrOutcome(msg({ complete: true, error: 'server refused' }), covered).transcribeState,
    ).toBeNull()
  })

  test('a completed run lets go of the worker and releases the model pass', () => {
    const outcome = asrOutcome(msg({ complete: true }), covered)

    expect(outcome.releasePort).toBe(true)
    expect(outcome.startLlm).toBe(true)
  })

  test('raises a retry for a failed run, and says nothing about one that worked', () => {
    expect(asrOutcome(msg({ complete: true, error: 'server refused' }), covered).notice).toBe(
      'server refused',
    )
    // Null rather than empty: the caller leaves the notice exactly as it is,
    // which is not the same as clearing it.
    expect(asrOutcome(msg({ complete: true }), covered).notice).toBeNull()
  })

  /**
   * A failed run still releases the model pass. Whatever it did transcribe is
   * the whole track there will ever be, so there is nothing left to wait for.
   */
  test('a failed run still hands the GPU to the model pass', () => {
    const outcome = asrOutcome(msg({ complete: true, error: 'server refused' }), covered)

    expect(outcome.startLlm).toBe(true)
    expect(outcome.releasePort).toBe(true)
  })
})
