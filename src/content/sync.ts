import type { Cue } from '../bilibili/subtitles'

/** Binary search for the cue active at `time`. Cues must be sorted by start. -1 if none active. */
export function findActiveCueIndex(cues: Cue[], time: number): number {
  let lo = 0
  let hi = cues.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const cue = cues[mid]
    if (time < cue.start) hi = mid - 1
    else if (time >= cue.end) lo = mid + 1
    else return mid
  }
  return -1
}

export interface PlaybackWatch {
  stop: () => void
  /**
   * Re-evaluates now, for when the cue list changed rather than the time.
   *
   * Needed because the frame callback below does not fire on a paused video,
   * which is exactly where someone waiting for a transcript leaves it: chunks
   * land, the array grows, and nothing on screen would ever notice.
   */
  refresh: () => void
}

/**
 * Drives `onCueChange` off the video's frame callback rather than
 * `timeupdate` (~4Hz, too coarse to paint a cue in sync with playback).
 * Only fires when the active cue actually changes.
 *
 * "Changes" means either the cue's start or its position moved, and both are
 * needed once a transcript arrives in pieces. A chunk landing earlier in the
 * track shifts every index after it, so index 4 can start naming a different
 * line — a cue change that memoising on the number alone would hide — while the
 * line you are watching keeps its start and moves to a new index, which the
 * caller has to be told about or it will read the wrong element of the array.
 */
export function watchPlayback(
  video: HTMLVideoElement,
  cues: Cue[],
  onCueChange: (index: number) => void,
): PlaybackWatch {
  /** The active cue's start, or null for none. Undefined until the first look. */
  let lastStart: number | null | undefined
  let lastIndex = -2 // distinct from the -1 "no active cue" sentinel
  let handle: number | null = null

  const evaluate = () => {
    const index = findActiveCueIndex(cues, video.currentTime)
    const start = index < 0 ? null : cues[index].start
    if (start === lastStart && index === lastIndex) return
    lastStart = start
    lastIndex = index
    onCueChange(index)
  }

  const tick = () => {
    evaluate()
    handle = video.requestVideoFrameCallback(tick)
  }
  handle = video.requestVideoFrameCallback(tick)

  return {
    stop: () => {
      if (handle !== null) video.cancelVideoFrameCallback(handle)
    },
    refresh: evaluate,
  }
}
