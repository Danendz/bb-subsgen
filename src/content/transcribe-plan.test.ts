import { describe, expect, test } from 'vitest'
import { planTranscription, type Situation } from './transcribe-plan'

/** A YouTube video with no track, a speech server configured, and nothing decided. */
const situation = (overrides: Partial<Situation> = {}): Situation => ({
  confidence: 'uncertain',
  approved: false,
  refused: false,
  usable: false,
  canTranscribe: true,
  ...overrides,
})

describe('when a run starts', () => {
  test('at once where the site is certain', () => {
    expect(planTranscription(situation({ confidence: 'certain' })).start).toBe('now')
  })

  test('at once on a channel already approved, however this video reads', () => {
    // Saying yes meant "this publisher is Chinese", which holds for the next one.
    expect(planTranscription(situation({ confidence: 'uncertain', approved: true })).start).toBe(
      'now',
    )
  })

  test('after some watching where the site says likely', () => {
    expect(planTranscription(situation({ confidence: 'likely' })).start).toBe('on-playback')
  })

  test('never where the site says this is not Chinese', () => {
    expect(planTranscription(situation({ confidence: 'negative' })).start).toBe('never')
  })

  test('never where this video was already declined', () => {
    expect(planTranscription(situation({ confidence: 'likely', refused: true })).start).toBe('never')
  })

  test('an approval outranks a refusal of the same video', () => {
    // The channel is the broader statement, and the only way both are set is
    // saying no here and yes on a sibling video.
    expect(planTranscription(situation({ approved: true, refused: true })).start).toBe('now')
  })
})

describe('what the overlay stands in for', () => {
  test('a question still counts as transcribing, so the overlay exists to carry it', () => {
    expect(planTranscription(situation()).transcribing).toBe(true)
  })

  test('a published track is used rather than transcribed over', () => {
    const plan = planTranscription(situation({ confidence: 'certain', usable: true }))
    expect(plan.transcribing).toBe(false)
    expect(plan.verdict).toBe('using the track')
  })

  test('nothing is transcribed with no speech server configured', () => {
    expect(planTranscription(situation({ canTranscribe: false })).transcribing).toBe(false)
  })
})

describe('whether a run is under way at load', () => {
  // This is what the progress pill reports. Anything visible here on a video
  // that has spent nothing is a bar that never comes back down: no run will
  // complete to clear it.

  test('running where the run begins immediately', () => {
    expect(planTranscription(situation({ confidence: 'certain' })).running).toBe(true)
  })

  test('not running while the video is only being asked about', () => {
    const plan = planTranscription(situation())
    expect(plan.start).toBe('ask')
    expect(plan.transcribing).toBe(true)
    expect(plan.running).toBe(false)
  })

  test('not running while a likely video is still being watched into', () => {
    const plan = planTranscription(situation({ confidence: 'likely' }))
    expect(plan.start).toBe('on-playback')
    expect(plan.transcribing).toBe(true)
    expect(plan.running).toBe(false)
  })

  test('not running on a video declined for now', () => {
    expect(planTranscription(situation({ refused: true })).running).toBe(false)
  })

  test('not running where the published track is used', () => {
    expect(planTranscription(situation({ confidence: 'certain', usable: true })).running).toBe(false)
  })
})
