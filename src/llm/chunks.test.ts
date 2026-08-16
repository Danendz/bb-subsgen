import { describe, expect, test } from 'vitest'
import { mergeCues, orderFromPlayhead, ownedCues, planChunks, type Chunk } from './chunks'

describe('planChunks', () => {
  test('covers the whole track, end to end, with no gaps', () => {
    const chunks = planChunks(3000, { span: 300, pad: 5 })
    expect(chunks).toHaveLength(10)
    expect(chunks[0].start).toBe(0)
    expect(chunks.at(-1)?.end).toBe(3000)
    for (let at = 1; at < chunks.length; at++) {
      expect(chunks[at].start).toBe(chunks[at - 1].end)
    }
  })

  test('pads the audio either side of the stretch a chunk owns', () => {
    const [first, second] = planChunks(3000, { span: 300, pad: 5 })
    expect(second.start).toBe(300)
    expect(second.audioStart).toBe(295)
    expect(second.audioEnd).toBe(605)
    // Nothing exists before zero to pad with.
    expect(first.audioStart).toBe(0)
  })

  test('never asks for audio past the end of the track', () => {
    const last = planChunks(310, { span: 300, pad: 5 }).at(-1)!
    expect(last.end).toBe(310)
    expect(last.audioEnd).toBe(310)
  })

  test('absorbs a trailing sliver instead of giving it a request', () => {
    // A real one: 航拍中国 reports 3000.6s, which planned an eleventh chunk
    // owning six tenths of a second and sent five seconds of audio to ask what
    // was in it — audio the chunk before had already heard as padding.
    const chunks = planChunks(3000.6, { span: 300, pad: 5 })

    expect(chunks).toHaveLength(10)
    expect(chunks.at(-1)!.end).toBe(3000.6)
    expect(chunks.at(-1)!.audioEnd).toBe(3000.6)
  })

  test('leaves no stretch of the track unowned when it does', () => {
    // Absorbed, not dropped: a cue starting in the sliver still has to belong
    // to a chunk, or it is silently lost from the transcript.
    const chunks = planChunks(3000.6, { span: 300, pad: 5 })
    const last = chunks.at(-1)!

    expect(ownedCues([{ start: 3000.4, end: 3000.6, text: '完' }], last)).toHaveLength(1)
  })

  test('still gives a short track its own single chunk', () => {
    // The sliver rule must never eat the only chunk there is.
    expect(planChunks(3, { span: 300, pad: 5 })).toHaveLength(1)
    expect(planChunks(3, { span: 300, pad: 5 })[0].end).toBe(3)
  })

  test('makes one chunk of a track shorter than a span', () => {
    expect(planChunks(120, { span: 300 })).toHaveLength(1)
  })

  test('plans nothing for a video with no reported duration', () => {
    // playurl reports zero for a video it will not serve, and transcribing no
    // audio is a request that can only fail.
    expect(planChunks(0)).toEqual([])
    expect(planChunks(-1)).toEqual([])
  })
})

const chunk = (index: number, start: number, end: number): Chunk => ({
  index,
  start,
  end,
  audioStart: start,
  audioEnd: end,
})

describe('ownedCues', () => {
  test('keeps only the cues starting inside the stretch a chunk owns', () => {
    const cues = [
      { start: 294, end: 296, text: '在垫子里' },
      { start: 301, end: 303, text: '新疆很大。' },
      { start: 599, end: 601, text: '天山在这里。' },
      { start: 604, end: 606, text: '下一段' },
    ]
    expect(ownedCues(cues, chunk(1, 300, 600))).toEqual([
      { start: 301, end: 303, text: '新疆很大。' },
      { start: 599, end: 601, text: '天山在这里。' },
    ])
  })

  test('a line running over the boundary belongs to where it began', () => {
    // Which is why ownership is decided on start alone: the alternative cuts a
    // sentence in half at an arbitrary five-minute mark.
    const cues = [{ start: 599, end: 604, text: '天山在这里。' }]
    expect(ownedCues(cues, chunk(1, 300, 600))).toHaveLength(1)
    expect(ownedCues(cues, chunk(2, 600, 900))).toHaveLength(0)
  })

  test('the padding is what the model heard, not what it may report', () => {
    const padded: Chunk = { index: 1, start: 300, end: 600, audioStart: 295, audioEnd: 605 }
    const cues = [{ start: 296, end: 298, text: '前一段的话' }]
    expect(ownedCues(cues, padded)).toEqual([])
  })
})

describe('orderFromPlayhead', () => {
  const chunks = [chunk(0, 0, 300), chunk(1, 300, 600), chunk(2, 600, 900), chunk(3, 900, 1200)]

  test('starts with the chunk being watched, then runs on', () => {
    expect(orderFromPlayhead(chunks, 650).map((c) => c.index)).toEqual([2, 3, 0, 1])
  })

  test('leaves the order alone when the playhead is in the first chunk', () => {
    expect(orderFromPlayhead(chunks, 10).map((c) => c.index)).toEqual([0, 1, 2, 3])
  })

  test('leaves the order alone when the playhead is nowhere in the track', () => {
    expect(orderFromPlayhead(chunks, 99999).map((c) => c.index)).toEqual([0, 1, 2, 3])
  })
})

describe('mergeCues', () => {
  test('puts chunks that finished out of order back into track order', () => {
    // Chunks are transcribed playhead-first, so they come back shuffled — and
    // everything downstream indexes cues by their position in this array.
    const merged = mergeCues([
      [{ start: 600, end: 602, text: '第三段' }],
      [{ start: 0, end: 2, text: '第一段' }],
      [{ start: 300, end: 302, text: '第二段' }],
    ])
    expect(merged.map((cue) => cue.text)).toEqual(['第一段', '第二段', '第三段'])
  })

  test('copes with chunks that produced nothing', () => {
    expect(mergeCues([[], []])).toEqual([])
  })
})
