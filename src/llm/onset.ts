// Finding where a line's voice actually starts, in the audio itself.
//
// A speech model's line start is not a measurement. Whisper begins a segment at
// `t_last` — the end of the previous one — so the silence between two sentences
// is attached to the front of the second, and the line appears the moment the
// previous speaker stops. Voice-activity detection at the server does not fix
// this: it deletes the pause from the audio, then whisper.cpp maps the timings
// faithfully back onto the original track and the pause comes back with them.
// On a documentary those gaps run to ten seconds.
//
// The measurement exists, though, and only in one place. The offscreen document
// has already decoded the whole track to mono 16kHz in order to send it, and it
// still holds it while the chunks come back. Where the sound starts is a
// question about that array.
//
// Everything here fails towards leaving the cue alone. A line the model timed
// correctly must not be moved, and a window this cannot read confidently — a
// music bed as loud as the narration over it — is a window it declines.

import type { Cue } from '../bilibili/subtitles'

/** Matches the rate the audio was decoded and sent at; see llm/wav.ts. */
const SAMPLE_RATE = 16_000

/** Short enough to place an onset precisely, long enough for a stable level. */
const FRAME_S = 0.02

/**
 * How much louder than the quietest part of its own window a line has to get
 * before the window is worth reading at all, in decibels.
 *
 * Below this there is no onset to find: either the line is continuous speech
 * with nothing in front of it, or whatever is underneath it is as loud as the
 * voice. Both end the same way — the cue is returned untouched.
 */
const MIN_CONTRAST_DB = 8

/** Where between the quiet floor and the loudest frame the voice is taken to begin. */
const ONSET_FRACTION = 0.5

/**
 * The quiet that has to be in front of a line before its start is moved at all.
 *
 * This is the guard that protects a line the model got right: one that opens on
 * speech has nothing quiet in front of it and is left exactly as it was. Only a
 * line sitting at the front of a real pause clears it.
 */
const MIN_LEAD_SILENCE_S = 0.2

/** Kept in front of the onset, so the first consonant is not clipped off. */
const LEAD_IN_S = 0.12

/** However early a line was, it still needs long enough on screen to be read. */
const MIN_LINE_S = 0.6

export interface OnsetOptions {
  sampleRate?: number
  frame?: number
  contrast?: number
  leadIn?: number
  minLeadSilence?: number
  minLine?: number
}

/**
 * Below anything a decoded stream contains, and a floor rather than -Infinity.
 *
 * Digital silence is real — a track can be zero-filled between scenes — and an
 * infinity would make every difference computed from it either infinite or NaN.
 */
const SILENCE_DB = -120

/** Loudness of one stretch of samples, in dBFS. */
function frameDb(samples: Float32Array, from: number, to: number): number {
  let sum = 0
  for (let at = from; at < to; at++) sum += samples[at] * samples[at]
  const rms = Math.sqrt(sum / (to - from))
  return rms > 0 ? Math.max(SILENCE_DB, 20 * Math.log10(rms)) : SILENCE_DB
}

/**
 * The level only a given share of the window is quieter than.
 *
 * A percentile rather than the minimum, because one frame between two syllables
 * is not the floor of anything — the quiet the rule is looking for is the kind
 * that lasts.
 */
function percentile(values: number[], share: number): number {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * share))]
}

/**
 * Where the voice starts inside a window, in seconds from its beginning, or null.
 *
 * The levels come from the window itself rather than from a fixed threshold, and
 * that is the whole reason this works over a documentary: what has to be beaten
 * is the music under *this* line, not a number chosen once for every video ever
 * transcribed. Null whenever the window cannot answer confidently.
 */
export function findOnset(
  samples: Float32Array,
  from: number,
  to: number,
  options: OnsetOptions = {},
): number | null {
  const {
    sampleRate = SAMPLE_RATE,
    frame = FRAME_S,
    contrast = MIN_CONTRAST_DB,
    minLeadSilence = MIN_LEAD_SILENCE_S,
  } = options

  const step = Math.max(1, Math.round(frame * sampleRate))
  const first = Math.max(0, Math.floor(from * sampleRate))
  const last = Math.min(samples.length, Math.ceil(to * sampleRate))

  const levels: number[] = []
  for (let at = first; at + step <= last; at += step) levels.push(frameDb(samples, at, at + step))
  if (levels.length < 2) return null

  const loudest = Math.max(...levels)
  const bed = percentile(levels, 0.1)
  // Too little contrast to read: continuous speech with nothing in front of it,
  // a bed as loud as the voice over it, or a window holding no sound at all.
  if (loudest <= SILENCE_DB || loudest - bed < contrast) return null

  const threshold = bed + ONSET_FRACTION * (loudest - bed)
  const onset = levels.findIndex((level) => level >= threshold)
  if (onset < 0) return null

  const silence = onset * frame
  return silence >= minLeadSilence ? silence : null
}

/**
 * Cues moved forward onto the sound they describe.
 *
 * Only ever later, and never so far that the line has no time left to be read
 * in. Ends are not touched: Whisper's end is where the speech stopped, which is
 * the one timing it is reliably right about.
 *
 * `samples` is the whole track from zero and cue times are absolute track
 * seconds, so there is no offset to keep in step here.
 */
export function snapToOnset(cues: Cue[], samples: Float32Array, options: OnsetOptions = {}): Cue[] {
  const { leadIn = LEAD_IN_S, minLine = MIN_LINE_S } = options

  return cues.map((cue) => {
    const silence = findOnset(samples, cue.start, cue.end, options)
    if (silence === null) return cue

    const start = Math.min(cue.start + silence - leadIn, cue.end - minLine)
    return start > cue.start ? { ...cue, start } : cue
  })
}
