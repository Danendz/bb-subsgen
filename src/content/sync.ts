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

/**
 * Drives `onCueChange` off the video's frame callback rather than
 * `timeupdate` (~4Hz, too coarse to paint a cue in sync with playback).
 * Only fires when the active cue index actually changes.
 */
export function watchPlayback(
  video: HTMLVideoElement,
  cues: Cue[],
  onCueChange: (index: number) => void,
): () => void {
  let lastIndex = -2 // distinct from the -1 "no active cue" sentinel
  let handle: number | null = null

  const tick = () => {
    const index = findActiveCueIndex(cues, video.currentTime)
    if (index !== lastIndex) {
      lastIndex = index
      onCueChange(index)
    }
    handle = video.requestVideoFrameCallback(tick)
  }
  handle = video.requestVideoFrameCallback(tick)

  return () => {
    if (handle !== null) video.cancelVideoFrameCallback(handle)
  }
}
