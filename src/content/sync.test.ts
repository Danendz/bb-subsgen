import { describe, expect, test } from 'vitest'
import { findActiveCueIndex, watchPlayback } from './sync'
import type { Cue } from '../bilibili/subtitles'

const cues: Cue[] = [
  { start: 1, end: 3, text: 'a' },
  { start: 3, end: 5, text: 'b' },
  { start: 7, end: 9, text: 'c' },
]

describe('findActiveCueIndex', () => {
  test('finds the cue containing the current time', () => {
    expect(findActiveCueIndex(cues, 2)).toBe(0)
    expect(findActiveCueIndex(cues, 4)).toBe(1)
    expect(findActiveCueIndex(cues, 8)).toBe(2)
  })

  test('treats cue start as inclusive and end as exclusive', () => {
    expect(findActiveCueIndex(cues, 3)).toBe(1)
    expect(findActiveCueIndex(cues, 5)).toBe(-1)
  })

  test('returns -1 in a gap between cues', () => {
    expect(findActiveCueIndex(cues, 6)).toBe(-1)
  })

  test('returns -1 before the first cue and after the last', () => {
    expect(findActiveCueIndex(cues, 0)).toBe(-1)
    expect(findActiveCueIndex(cues, 100)).toBe(-1)
  })

  test('returns -1 for an empty cue list', () => {
    expect(findActiveCueIndex([], 5)).toBe(-1)
  })
})

/** A video that only advances a frame when a test says so. */
function fakeVideo() {
  const pending = new Map<number, () => void>()
  let handle = 0
  const video = {
    currentTime: 0,
    requestVideoFrameCallback: (fn: () => void) => {
      pending.set(++handle, fn)
      return handle
    },
    cancelVideoFrameCallback: (id: number) => pending.delete(id),
  }
  return {
    video: video as unknown as HTMLVideoElement,
    seek: (time: number) => {
      video.currentTime = time
    },
    /** One painted frame. `tick` re-registers itself, so this drains and reruns. */
    frame: () => {
      const due = [...pending.values()]
      pending.clear()
      due.forEach((fn) => fn())
    },
  }
}

describe('watchPlayback', () => {
  test('reports the cue under the playhead as it changes', () => {
    const { video, seek, frame } = fakeVideo()
    const seen: number[] = []
    watchPlayback(video, [...cues], (index) => seen.push(index))

    seek(2)
    frame()
    seek(4)
    frame()

    expect(seen).toEqual([0, 1])
  })

  test('stays quiet while the same cue is on screen', () => {
    const { video, seek, frame } = fakeVideo()
    const seen: number[] = []
    watchPlayback(video, [...cues], (index) => seen.push(index))

    seek(2)
    frame()
    seek(2.5)
    frame()

    expect(seen).toEqual([0])
  })

  test('fires when the line at an index changes though the index did not', () => {
    // A chunk lands and index 0 starts naming a different sentence. Memoising
    // on the index alone would leave the old line painted.
    const live: Cue[] = [{ start: 1, end: 3, text: '第一段' }]
    const { video, seek, frame } = fakeVideo()
    const seen: string[] = []
    const watch = watchPlayback(video, live, (index) => seen.push(live[index].text))

    seek(2)
    frame()
    live[0] = { start: 1.5, end: 3, text: '换了' }
    watch.refresh()

    expect(seen).toEqual(['第一段', '换了'])
  })

  test('fires when the index changes though the line did not', () => {
    // The other half of the same problem: a chunk lands earlier in the track,
    // every index after it shifts, and the line you are watching is still the
    // same line at a new position. The caller indexes the array, so it has to
    // be told or it reads the wrong element from here on.
    const live: Cue[] = [{ start: 10, end: 12, text: '第二段' }]
    const { video, seek, frame } = fakeVideo()
    const seen: number[] = []
    const watch = watchPlayback(video, live, (index) => seen.push(index))

    seek(11)
    frame()
    live.unshift({ start: 1, end: 3, text: '第一段' })
    watch.refresh()

    expect(seen).toEqual([0, 1])
  })

  test('refresh reports a cue that arrived while the video was paused', () => {
    // requestVideoFrameCallback does not fire on a paused video, which is where
    // someone waiting for a transcript leaves it. Without this, chunks land and
    // nothing on screen ever notices.
    const live: Cue[] = []
    const { video, seek } = fakeVideo()
    const seen: number[] = []
    const watch = watchPlayback(video, live, (index) => seen.push(index))

    seek(2)
    watch.refresh()
    live.push({ start: 1, end: 3, text: '第一段' })
    watch.refresh()

    // -1 first: nothing had been transcribed yet, so there was no line to show.
    expect(seen).toEqual([-1, 0])
  })

  test('reports -1 when the playhead leaves every cue', () => {
    const { video, seek, frame } = fakeVideo()
    const seen: number[] = []
    watchPlayback(video, [...cues], (index) => seen.push(index))

    seek(2)
    frame()
    seek(6)
    frame()

    expect(seen).toEqual([0, -1])
  })

  test('stops looking once torn down', () => {
    const { video, seek, frame } = fakeVideo()
    const seen: number[] = []
    const watch = watchPlayback(video, [...cues], (index) => seen.push(index))

    watch.stop()
    seek(2)
    frame()

    expect(seen).toEqual([])
  })
})
