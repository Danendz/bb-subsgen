// What the worker and the offscreen document say to each other.
//
// Its own module so both ends import the same shapes, and so neither has to
// import the other — the worker must not pull in the document's Web Audio code,
// and the document must not pull in the worker's database.

import type { AudioSource } from '../media/audio-source'
import type { Cue } from '../media/cue'
import type { AudioSlice } from './audio-transfer'

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
  /**
   * The audio, already located by whoever knows the site.
   *
   * Resolved rather than described: this used to be Bilibili's `cid`, which the
   * offscreen document turned into a URL by calling Bilibili's playurl API. That
   * made a decoder know one site's API, and it is the coupling `AudioSource`
   * exists to remove.
   */
  audio: AudioSource
  baseUrl: string
  model: string
  /** Where playback is, so the chunk being watched is transcribed first. */
  playhead: number
  /**
   * Lines a previous run produced, to be kept rather than asked for again.
   *
   * Set together with `only`, and only then: a run given a seed is picking up
   * where one that failed left off.
   */
  seed?: Cue[]
  /**
   * The stretches to transcribe, as `[start, end]` in seconds — the gaps a
   * previous run could not fill.
   *
   * Stretches rather than chunk indices, because the plan a chunk index refers
   * to depends on where playback was when it was made. A second run would cut
   * the track differently and the same index would name different audio.
   */
  only?: Array<[number, number]>
}

export interface CancelRequest {
  type: 'bb-subsgen:offscreen-cancel'
  target: typeof OFFSCREEN_TARGET
}

/**
 * Where playback moved to, so the run can re-order what is left.
 *
 * Sent on a seek and on nothing else. Ordinary playback needs no updates,
 * because chunks already advance in the direction you are watching.
 */
export interface PlayheadRequest {
  type: 'bb-subsgen:offscreen-playhead'
  target: typeof OFFSCREEN_TARGET
  seconds: number
}

/**
 * One slice of the audio the offscreen document asked for, fetched by the page.
 *
 * Sent by a content script straight to the offscreen document — they share one
 * message bus — rather than routed back through the worker. The worker's job in
 * this exchange is to say *which* tab should answer, which it has already done
 * by the time this is sent; putting twenty-five megabytes through it as well
 * would be a second copy for no decision.
 *
 * Base64, in slices, because Chrome serializes extension messages as JSON and a
 * `Blob` or `ArrayBuffer` on this bus arrives as `{}`. See the header of
 * `audio-transfer.ts` for what was tried instead.
 */
export interface AudioSupply extends Partial<AudioSlice> {
  type: 'bb-subsgen:offscreen-audio'
  target: typeof OFFSCREEN_TARGET
  /** Whose audio this is, so a late answer for an abandoned run is ignored. */
  videoId: string
  /** Absent on success; set when the page could not get the audio at all. */
  error?: string
}

export type OffscreenRequest = TranscribeRequest | CancelRequest | PlayheadRequest | AudioSupply

/**
 * The offscreen document asking the page to download an audio stream for it.
 *
 * It cannot do this itself. Bilibili's CDN requires a bilibili referrer and
 * Chrome sends none from an extension page; see `fetchAudioBytes`, which is the
 * content script's half of this exchange.
 */
export interface AudioNeeded {
  type: 'bb-subsgen:offscreen-need-audio'
  videoId: string
  /** The stream URL, as playurl named it. */
  url: string
}

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
  /**
   * The stretches of track transcribed so far, as `[start, end]` in seconds.
   *
   * Sent because the cues cannot answer the question the overlay asks of them —
   * "has the part I am watching been done yet" — and the chunk plan can. A chunk
   * over a silent stretch is transcribed perfectly and produces no cues at all,
   * which is indistinguishable from a chunk that has not run.
   */
  covered: Array<[number, number]>
}

/** Sent once, when there is nothing more coming. */
export interface TranscribeDone {
  type: 'bb-subsgen:offscreen-done'
  videoId: string
  cues: Cue[]
  /** Chunks transcribed, and chunks the run set out to do. */
  done: number
  total: number
  /**
   * The stretches that could not be transcribed, as `[start, end]` in seconds.
   *
   * Empty on a clean run, and what a retry is handed as its `only`. Kept as
   * stretches for the reason given on `TranscribeRequest.only`.
   */
  failed: Array<[number, number]>
  /** Absent on success; set when something went wrong, whole or partial. */
  error?: string
}

export type OffscreenEvent = TranscribeProgress | TranscribeDone | AudioNeeded

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

export function isAudioNeeded(msg: unknown): msg is AudioNeeded {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    (msg as { type?: unknown }).type === 'bb-subsgen:offscreen-need-audio' &&
    typeof (msg as { url?: unknown }).url === 'string'
  )
}

export function isTranscribeDone(msg: unknown): msg is TranscribeDone {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    (msg as { type?: unknown }).type === 'bb-subsgen:offscreen-done'
  )
}
