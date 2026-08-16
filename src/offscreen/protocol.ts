// What the worker and the offscreen document say to each other.
//
// Its own module so both ends import the same shapes, and so neither has to
// import the other — the worker must not pull in the document's Web Audio code,
// and the document must not pull in the worker's database.

import type { Cue } from '../bilibili/subtitles'

/**
 * Every message on this channel carries it, because an offscreen document shares
 * one runtime message bus with the popup, the study app and every content
 * script. Without a target field each of them receives the others' traffic and
 * has to guess what is meant for it.
 */
export const OFFSCREEN_TARGET = 'bb-subsgen-offscreen'

export interface TranscribeRequest {
  type: 'bb-subsgen:offscreen-transcribe'
  target: typeof OFFSCREEN_TARGET
  videoId: string
  cid: number
  baseUrl: string
  model: string
  /** Where playback is, so the chunk being watched is transcribed first. */
  playhead: number
}

export interface CancelRequest {
  type: 'bb-subsgen:offscreen-cancel'
  target: typeof OFFSCREEN_TARGET
}

export type OffscreenRequest = TranscribeRequest | CancelRequest

/**
 * One chunk's worth of progress, sent as each lands.
 *
 * `cues` is every cue found so far rather than only this chunk's. Chunks are
 * transcribed playhead-first and so arrive out of order, and re-sorting a
 * complete list at this end is both cheaper and harder to get wrong than asking
 * the far end to splice fragments into the right places. The whole list for a
 * fifty-minute episode is a few hundred kilobytes, sent perhaps ten times.
 */
export interface TranscribeProgress {
  type: 'bb-subsgen:offscreen-progress'
  videoId: string
  done: number
  total: number
  cues: Cue[]
}

/** Sent once, when there is nothing more coming. */
export interface TranscribeDone {
  type: 'bb-subsgen:offscreen-done'
  videoId: string
  cues: Cue[]
  /** Absent on success; set when the run ended early. */
  error?: string
}

export type OffscreenEvent = TranscribeProgress | TranscribeDone

export function isOffscreenRequest(msg: unknown): msg is OffscreenRequest {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    (msg as { target?: unknown }).target === OFFSCREEN_TARGET
  )
}

export function isTranscribeProgress(msg: unknown): msg is TranscribeProgress {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    (msg as { type?: unknown }).type === 'bb-subsgen:offscreen-progress'
  )
}

export function isTranscribeDone(msg: unknown): msg is TranscribeDone {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    (msg as { type?: unknown }).type === 'bb-subsgen:offscreen-done'
  )
}
