import { beforeEach, describe, expect, test } from 'vitest'
import { openLlmDb } from '../llm/db'
import {
  clearTranscriptsIn,
  evictTranscriptsIn,
  readTranscriptIn,
  transcriptSizeIn,
  writeTranscriptIn,
  type TranscriptKey,
} from './transcript-cache'

const KEY: TranscriptKey = { videoId: 'ep335910', model: 'large-v3-turbo' }

const cue = (start: number, text: string) => ({ start, end: start + 2, text })

describe('the transcript cache', () => {
  let db: IDBDatabase

  beforeEach(async () => {
    db = await openLlmDb(`transcripts-${Math.random()}`)
  })

  test('reads back what was written, in track order', async () => {
    await writeTranscriptIn(db, KEY, [cue(4.5, '天山在这里。'), cue(0, '新疆很大。')])

    expect(await readTranscriptIn(db, KEY)).toEqual([
      { start: 0, end: 2, text: '新疆很大。' },
      { start: 4.5, end: 6.5, text: '天山在这里。' },
    ])
  })

  test('returns nothing for a video never transcribed', async () => {
    expect(await readTranscriptIn(db, KEY)).toEqual([])
  })

  test('keeps a different model’s transcript apart', async () => {
    // Not a stale version of the same thing: swapping in a Mandarin-tuned model
    // should not silently serve the old one's mistakes.
    await writeTranscriptIn(db, KEY, [cue(0, '新疆很大。')])
    await writeTranscriptIn(db, { ...KEY, model: 'belle-whisper-zh' }, [cue(0, '新疆很大！')])

    expect((await readTranscriptIn(db, KEY))[0].text).toBe('新疆很大。')
    expect((await readTranscriptIn(db, { ...KEY, model: 'belle-whisper-zh' }))[0].text).toBe(
      '新疆很大！',
    )
  })

  test('keeps videos apart', async () => {
    await writeTranscriptIn(db, KEY, [cue(0, '新疆很大。')])
    await writeTranscriptIn(db, { ...KEY, videoId: 'ep335911' }, [cue(0, '海南很小。')])

    expect(await readTranscriptIn(db, KEY)).toHaveLength(1)
    expect((await readTranscriptIn(db, { ...KEY, videoId: 'ep335911' }))[0].text).toBe('海南很小。')
  })

  test('writing a line again replaces it', async () => {
    await writeTranscriptIn(db, KEY, [cue(0, '新疆很大。')])
    await writeTranscriptIn(db, KEY, [cue(0, '新疆很大，天山在这里。')])

    const cues = await readTranscriptIn(db, KEY)
    expect(cues).toHaveLength(1)
    expect(cues[0].text).toBe('新疆很大，天山在这里。')
  })

  test('writing nothing is not an error, and stores nothing', async () => {
    await writeTranscriptIn(db, KEY, [])
    expect(await transcriptSizeIn(db)).toEqual({ videos: 0, lines: 0 })
  })

  test('reports what is cached', async () => {
    await writeTranscriptIn(db, KEY, [cue(0, '一'), cue(2, '二')])
    await writeTranscriptIn(db, { ...KEY, videoId: 'ep335911' }, [cue(0, '三')])

    expect(await transcriptSizeIn(db)).toEqual({ videos: 2, lines: 3 })
  })

  test('clears everything', async () => {
    await writeTranscriptIn(db, KEY, [cue(0, '新疆很大。')])
    await clearTranscriptsIn(db)
    expect(await transcriptSizeIn(db)).toEqual({ videos: 0, lines: 0 })
  })
})

describe('eviction', () => {
  let db: IDBDatabase

  beforeEach(async () => {
    db = await openLlmDb(`transcripts-evict-${Math.random()}`)
  })

  test('does nothing while there is room', async () => {
    await writeTranscriptIn(db, KEY, [cue(0, '一')])
    expect(await evictTranscriptsIn(db, 20)).toBe(0)
    expect(await readTranscriptIn(db, KEY)).toHaveLength(1)
  })

  test('drops whole videos, oldest first', async () => {
    // Whole videos rather than individual lines: half a transcript is not worth
    // a third of a whole one, it is worth nothing.
    for (const videoId of ['ep1', 'ep2', 'ep3']) {
      await writeTranscriptIn(db, { ...KEY, videoId }, [cue(0, '一'), cue(2, '二')])
    }

    expect(await evictTranscriptsIn(db, 2)).toBe(1)
    expect(await readTranscriptIn(db, { ...KEY, videoId: 'ep1' })).toEqual([])
    expect(await readTranscriptIn(db, { ...KEY, videoId: 'ep3' })).toHaveLength(2)
  })
})
