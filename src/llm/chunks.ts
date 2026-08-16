// Cutting a track into pieces a speech model can be asked about one at a time.
//
// Three things follow from chunking, and only one of them is about memory:
//
//   - There is progress to report. A server handed a whole file answers once, at
//     the end, so "Transcribing…" would have nothing to count.
//   - The first lines arrive in seconds rather than minutes, so a video becomes
//     readable almost immediately instead of after the whole episode is done.
//   - Work can be ordered around the playhead, exactly as `pickBatch` orders
//     translation batches, so what you are about to watch is done first.
//
// Chunks overlap, but no cue is ever produced twice. Each chunk *owns* a stretch
// of the track and keeps only the cues starting inside it; the overlap is
// acoustic padding, there so the model hears a run-up to the boundary rather
// than a word sliced in half. That makes deduplication a comparison of numbers
// rather than a guess about whether two transcriptions of the same second are
// the same sentence.

import type { Cue } from '../bilibili/subtitles'

/** Seconds of track each chunk is responsible for. */
export const CHUNK_SPAN_S = 300

/**
 * Seconds of extra audio sent either side of that.
 *
 * Enough to carry a sentence across the join. Whisper decodes in 30-second
 * windows internally, so this is not about its window size — it is about not
 * starting a request in the middle of a word.
 */
export const CHUNK_PAD_S = 5

export interface Chunk {
  index: number
  /** The stretch of track this chunk owns, and the only cues it may contribute. */
  start: number
  end: number
  /** The audio actually sent, padded either side. */
  audioStart: number
  audioEnd: number
}

export interface PlanOptions {
  span?: number
  pad?: number
}

/**
 * The chunks a track of `duration` seconds breaks into, in track order.
 *
 * A duration of zero yields nothing rather than one empty chunk: the playurl API
 * reports a length of zero for a video it would not serve, and asking a model to
 * transcribe no audio is a request that can only fail.
 */
export function planChunks(duration: number, { span = CHUNK_SPAN_S, pad = CHUNK_PAD_S }: PlanOptions = {}): Chunk[] {
  if (!(duration > 0)) return []

  const chunks: Chunk[] = []
  for (let start = 0, index = 0; start < duration; start += span, index++) {
    const end = Math.min(start + span, duration)

    // A last sliver, absorbed into the chunk before rather than given a request
    // of its own. A duration of 3000.6s otherwise plans an eleventh chunk owning
    // 0.6 of a second and sends five seconds of audio to ask what is in it —
    // audio the previous chunk already heard as padding. Absorbed rather than
    // dropped, because a cue starting inside that sliver still has to belong to
    // someone, and its owner has already listened to it.
    const previous = chunks[chunks.length - 1]
    if (previous && end - start <= pad) {
      previous.end = end
      previous.audioEnd = Math.min(duration, end + pad)
      break
    }

    chunks.push({
      index,
      start,
      end,
      audioStart: Math.max(0, start - pad),
      audioEnd: Math.min(duration, end + pad),
    })
  }
  return chunks
}

/**
 * The cues a chunk is entitled to keep.
 *
 * Ownership is decided by where a cue *starts*, so a line running across the
 * boundary belongs to the chunk it began in and is not cut in two. The padding
 * either side is what the model heard, not what it may report.
 */
export function ownedCues(cues: Cue[], chunk: Chunk): Cue[] {
  return cues.filter((cue) => cue.start >= chunk.start && cue.start < chunk.end)
}

/**
 * The chunks to do next: the one containing the playhead first, then onwards,
 * then wrapping to the start.
 *
 * The same rule `pickBatch` applies to translation batches, and for the same
 * reason — seeking re-orders what is left without any machinery for it, because
 * this is re-read rather than computed once.
 */
export function orderFromPlayhead(chunks: Chunk[], playhead: number): Chunk[] {
  const at = chunks.findIndex((chunk) => playhead >= chunk.start && playhead < chunk.end)
  if (at <= 0) return chunks
  return [...chunks.slice(at), ...chunks.slice(0, at)]
}

/**
 * Cues from every chunk done so far, in track order.
 *
 * Sorted rather than appended because chunks are transcribed playhead-first and
 * therefore arrive out of order — and everything downstream, from
 * `watchPlayback` to `planBatches`, indexes cues by position in this array.
 */
export function mergeCues(chunks: Iterable<Cue[]>): Cue[] {
  return [...chunks].flat().sort((a, b) => a.start - b.start)
}
