import { describe, expect, test } from 'vitest'
import { bufferedAhead, BUFFER_CUES, forCard, latch, preferred } from './tier'

describe('preferred', () => {
  test('shows the on-device translation before the gate opens', () => {
    expect(preferred({ nmt: 'quick', llm: 'better', latched: false })).toBe('quick')
  })

  test('shows the model once it has', () => {
    expect(preferred({ nmt: 'quick', llm: 'better', latched: true })).toBe('better')
  })

  // Seeking past what the model has reached: fall back per line rather than
  // showing nothing.
  test('falls back to the on-device one where the model has not reached', () => {
    expect(preferred({ nmt: 'quick', llm: undefined, latched: true })).toBe('quick')
  })

  test('uses the model when it is all there is, gate or no gate', () => {
    expect(preferred({ nmt: undefined, llm: 'better', latched: false })).toBe('better')
  })

  test('is empty when neither has arrived', () => {
    expect(preferred({ nmt: undefined, llm: undefined, latched: false })).toBe('')
  })
})

describe('forCard', () => {
  // The difference that matters: the same line, at the same moment, is shown as
  // one translation and stored as the other.
  test('takes the model’s even where the gate would have shown the other', () => {
    const tiers = { nmt: 'quick', llm: 'better' }

    expect(preferred({ ...tiers, latched: false })).toBe('quick')
    expect(forCard(tiers)).toBe('better')
  })

  test('falls back to the on-device one where the model has not reached', () => {
    expect(forCard({ nmt: 'quick', llm: undefined })).toBe('quick')
  })

  // A line captured in the opening seconds, before either has landed. The card
  // keeps the sentence and loses only the gloss under it.
  test('is empty when neither has arrived', () => {
    expect(forCard({ nmt: undefined, llm: undefined })).toBe('')
  })
})

describe('bufferedAhead', () => {
  const all = () => true

  test('counts an unbroken run from the playhead', () => {
    const done = new Set([5, 6, 7])

    expect(bufferedAhead(5, 10, (i) => done.has(i), all)).toBe(3)
  })

  test('stops at the first gap', () => {
    const done = new Set([5, 6, 8, 9])

    expect(bufferedAhead(5, 10, (i) => done.has(i), all)).toBe(2)
  })

  test('is zero when the line at the playhead is missing', () => {
    expect(bufferedAhead(5, 10, (i) => i > 5, all)).toBe(0)
  })

  // Blank cues are never sent for translation, so treating them as gaps would
  // cap the buffer at whatever ran before the first one.
  test('steps over lines that were never going to be translated', () => {
    const done = new Set([0, 2, 3])
    const translatable = (i: number) => i !== 1

    expect(bufferedAhead(0, 4, (i) => done.has(i), translatable)).toBe(3)
  })

  test('counts to the end of the track without running off it', () => {
    expect(bufferedAhead(8, 10, all, all)).toBe(2)
  })

  test('treats a playhead before the track as the start of it', () => {
    expect(bufferedAhead(-1, 3, all, all)).toBe(3)
  })
})

describe('latch', () => {
  test('opens once the buffer is deep enough', () => {
    expect(latch(false, BUFFER_CUES)).toBe(true)
  })

  test('stays shut below the threshold', () => {
    expect(latch(false, BUFFER_CUES - 1)).toBe(false)
  })

  // Seeking into untranslated territory falls back per line; it does not make
  // you earn the switch again.
  test('never closes again', () => {
    expect(latch(true, 0)).toBe(true)
  })
})
