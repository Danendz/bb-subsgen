import { describe, expect, test } from 'vitest'
import {
  chunkFor,
  coverageExcept,
  mergeCues,
  nextChunk,
  ownedCues,
  planChunks,
  type Chunk,
} from './chunks'

/** The regular grid, with the lead chunk switched off. */
const grid = { span: 300, pad: 5, lead: 0 }

describe('planChunks', () => {
  test('covers the whole track, end to end, with no gaps', () => {
    const chunks = planChunks(3000, grid)
    expect(chunks).toHaveLength(10)
    expect(chunks[0].start).toBe(0)
    expect(chunks.at(-1)?.end).toBe(3000)
    for (let at = 1; at < chunks.length; at++) {
      expect(chunks[at].start).toBe(chunks[at - 1].end)
    }
  })

  test('numbers chunks by their place in the track', () => {
    // Progress reporting and the merge both key on this.
    expect(planChunks(3000, grid).map((chunk) => chunk.index)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9,
    ])
  })

  test('pads the audio either side of the stretch a chunk owns', () => {
    const [first, second] = planChunks(3000, grid)
    expect(second.start).toBe(300)
    expect(second.audioStart).toBe(295)
    expect(second.audioEnd).toBe(605)
    // Nothing exists before zero to pad with.
    expect(first.audioStart).toBe(0)
  })

  test('never asks for audio past the end of the track', () => {
    const last = planChunks(310, grid).at(-1)!
    expect(last.end).toBe(310)
    expect(last.audioEnd).toBe(310)
  })

  test('absorbs a trailing sliver instead of giving it a request', () => {
    // A real one: 航拍中国 reports 3000.6s, which planned an eleventh chunk
    // owning six tenths of a second and sent five seconds of audio to ask what
    // was in it — audio the chunk before had already heard as padding.
    const chunks = planChunks(3000.6, grid)

    expect(chunks).toHaveLength(10)
    expect(chunks.at(-1)!.end).toBe(3000.6)
    expect(chunks.at(-1)!.audioEnd).toBe(3000.6)
  })

  test('leaves no stretch of the track unowned when it does', () => {
    // Absorbed, not dropped: a cue starting in the sliver still has to belong
    // to a chunk, or it is silently lost from the transcript.
    const chunks = planChunks(3000.6, grid)
    const last = chunks.at(-1)!

    expect(ownedCues([{ start: 3000.4, end: 3000.6, text: '完' }], last)).toHaveLength(1)
  })

  test('still gives a short track its own single chunk', () => {
    // The sliver rule must never eat the only chunk there is.
    expect(planChunks(3, grid)).toHaveLength(1)
    expect(planChunks(3, grid)[0].end).toBe(3)
  })

  test('makes one chunk of a track shorter than a span', () => {
    expect(planChunks(120, { span: 300, lead: 0 })).toHaveLength(1)
  })

  test('plans nothing for a video with no reported duration', () => {
    // playurl reports zero for a video it will not serve, and transcribing no
    // audio is a request that can only fail.
    expect(planChunks(0)).toEqual([])
    expect(planChunks(-1)).toEqual([])
  })
})

describe('planChunks, the lead chunk', () => {
  test('starts the track with a short chunk', () => {
    // Nothing is readable until a chunk finishes, so the first one to finish
    // decides how long the overlay stays blank.
    const chunks = planChunks(3000, { span: 300, pad: 5, lead: 60 })

    expect(chunks[0]).toMatchObject({ start: 0, end: 60 })
    expect(chunks[1]).toMatchObject({ start: 60, end: 300 })
    expect(chunks[2]).toMatchObject({ start: 300, end: 600 })
  })

  test('splits at the playhead, not at zero', () => {
    // The whole point of splitting at the playhead: joining an episode partway
    // should get the same fast first chunk as starting it from the beginning.
    const chunks = planChunks(3000, { span: 300, pad: 5, lead: 60, playhead: 1920 })
    const around = chunks.filter((chunk) => chunk.start >= 1800 && chunk.end <= 2100)

    expect(around.map((chunk) => [chunk.start, chunk.end])).toEqual([
      [1800, 1920],
      [1920, 1980],
      [1980, 2100],
    ])
  })

  test('still covers the whole track exactly once, wherever the playhead is', () => {
    for (const playhead of [0, 3, 1920, 2999]) {
      const chunks = planChunks(3000, { span: 300, pad: 5, lead: 60, playhead })
      expect(chunks[0].start).toBe(0)
      expect(chunks.at(-1)!.end).toBe(3000)
      for (let at = 1; at < chunks.length; at++) {
        expect(chunks[at].start).toBe(chunks[at - 1].end)
      }
    }
  })

  test('extends the lead back rather than leaving a sliver before it', () => {
    // A playhead three seconds in would otherwise own [0, 3) — shorter than the
    // padding, and with no previous chunk for the sliver rule to absorb it into.
    const chunks = planChunks(3000, { span: 300, pad: 5, lead: 60, playhead: 3 })

    expect(chunks[0]).toMatchObject({ start: 0, end: 63 })
  })

  test('plans no lead where the playhead is too near the end for one', () => {
    const chunks = planChunks(3000, { span: 300, pad: 5, lead: 60, playhead: 2998 })

    expect(chunks.at(-1)).toMatchObject({ start: 2700, end: 3000 })
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

describe('nextChunk', () => {
  const chunks = [chunk(0, 0, 300), chunk(1, 300, 600), chunk(2, 600, 900), chunk(3, 900, 1200)]

  test('picks the chunk being watched', () => {
    expect(nextChunk(chunks, 650)?.index).toBe(2)
  })

  test('picks the earliest chunk after the playhead when that one is done', () => {
    // The seek case: you jump to 10:50, its chunk is already transcribed, and
    // what you want next is what follows — not the top of the track.
    const remaining = chunks.filter((c) => c.index !== 2)
    expect(nextChunk(remaining, 650)?.index).toBe(3)
  })

  test('wraps to the start once nothing is left ahead', () => {
    const remaining = [chunks[0], chunks[1]]
    expect(nextChunk(remaining, 950)?.index).toBe(0)
  })

  test('starts at the top when the playhead is in the first chunk', () => {
    expect(nextChunk(chunks, 10)?.index).toBe(0)
  })

  test('starts at the top when the playhead is nowhere in the track', () => {
    expect(nextChunk(chunks, 99999)?.index).toBe(0)
  })

  test('is null when nothing is left', () => {
    expect(nextChunk([], 0)).toBeNull()
  })
})

describe('coverageExcept', () => {
  const plan = planChunks(3000, grid)

  test('reports nothing covered before anything has been done', () => {
    expect(coverageExcept(plan, 3000)).toEqual([])
  })

  test('reports the whole track once nothing is left', () => {
    expect(coverageExcept([], 3000)).toEqual([[0, 3000]])
  })

  test('merges finished chunks into one span rather than ten', () => {
    // Ten chunks done from the top; the overlay has one stretch to check
    // against, not ten.
    const pending = plan.filter((chunk) => chunk.index >= 3)
    expect(coverageExcept(pending, 3000)).toEqual([[0, 900]])
  })

  test('leaves a hole where a chunk in the middle is still outstanding', () => {
    // The seek case: you jumped to 30:00, so the chunks around it went first.
    const pending = plan.filter((chunk) => chunk.index !== 0 && chunk.index !== 6)
    expect(coverageExcept(pending, 3000)).toEqual([
      [0, 300],
      [1800, 2100],
    ])
  })

  test('describes a resumed run from its gaps alone', () => {
    // A retry is handed only the stretches that failed, so everything else is
    // covered by the transcript it was seeded with.
    const gaps = [chunkFor([1800, 2100], 0, 3000)]
    expect(coverageExcept(gaps, 3000)).toEqual([
      [0, 1800],
      [2100, 3000],
    ])
  })
})

describe('chunkFor', () => {
  test('pads a stretch the same way a planned chunk is padded', () => {
    expect(chunkFor([1800, 2100], 0, 3000, 5)).toEqual({
      index: 0,
      start: 1800,
      end: 2100,
      audioStart: 1795,
      audioEnd: 2105,
    })
  })

  test('never asks for audio outside the track', () => {
    expect(chunkFor([0, 60], 0, 3000, 5).audioStart).toBe(0)
    expect(chunkFor([2950, 3000], 0, 3000, 5).audioEnd).toBe(3000)
  })
})

describe('mergeCues', () => {
  test('puts chunks that finished out of order back into track order', () => {
    // Chunks are transcribed playhead-first, so they come back shuffled.
    const merged = mergeCues([
      [{ start: 600, end: 602, text: '第三段' }],
      [{ start: 0, end: 2, text: '第一段' }],
      [{ start: 300, end: 302, text: '第二段' }],
    ])
    expect(merged.map((cue) => cue.text)).toEqual(['第一段', '第二段', '第三段'])
  })

  test('keeps one cue per start', () => {
    // Start is a cue's identity everywhere downstream — the overlay keys its
    // translation caches by it — so two cues sharing one would show the same
    // translation twice and lose the other.
    const merged = mergeCues([
      [
        { start: 12, end: 14, text: '这里' },
        { start: 12, end: 15, text: '这里是' },
      ],
    ])
    expect(merged).toHaveLength(1)
  })

  test('copes with chunks that produced nothing', () => {
    expect(mergeCues([[], []])).toEqual([])
  })
})
