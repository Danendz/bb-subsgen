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

import type { Cue } from '../media/cue'

/** Seconds of track each chunk is responsible for. */
export const CHUNK_SPAN_S = 300

/**
 * Seconds in the one short chunk, split at the playhead.
 *
 * Nothing can be read until a chunk finishes, so the first one to finish decides
 * how long the overlay stays blank. Most of that wait is the fetch and the
 * decode — `decodeAudioData` needs a complete container, so there is no prefix
 * of the bytes that decodes to a prefix of the audio — but this takes the rest
 * of it off, and it is split at the playhead rather than at zero so that joining
 * an episode partway gets the same treatment as starting it.
 */
export const LEAD_SPAN_S = 60

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
  lead?: number
  /** Where playback is, so the short chunk is split around it. */
  playhead?: number
}

/**
 * Where one chunk ends and the next begins, in order, from 0 to `duration`.
 *
 * Built as points rather than as ranges because every rule here is about a
 * boundary: the regular grid puts one every `span`, the playhead adds two, and
 * the sliver rule removes the ones that would leave a piece too short to be
 * worth a request of its own. Expressed as ranges, those three would each need
 * their own special case and would have to agree about the others.
 */
function boundaries(duration: number, span: number, pad: number, lead: number, playhead: number): number[] {
  const points = new Set<number>([0])
  for (let at = span; at < duration; at += span) points.add(at)

  // The short chunk, split at the playhead rather than at zero. Both ends are
  // boundaries: the audio before the playhead still belongs to someone, in case
  // you seek back into it.
  const at = Math.max(0, playhead)
  if (at < duration) points.add(at)
  if (at + lead < duration) points.add(at + lead)

  const sorted = [...points].sort((a, b) => a - b)

  // A boundary too close to the one before it, or to the end, would leave a
  // piece shorter than the padding either side of it — a request asking about
  // audio its neighbour has already heard. Dropping the boundary is what merges
  // that piece into whichever chunk is adjacent, so no stretch of the track ends
  // up unowned and no cue is left without a chunk to belong to.
  const kept = [0]
  for (const point of sorted.slice(1)) {
    if (point - kept[kept.length - 1] <= pad) continue
    if (duration - point <= pad) continue
    kept.push(point)
  }
  kept.push(duration)
  return kept
}

/**
 * The chunks a track of `duration` seconds breaks into, in track order.
 *
 * A duration of zero yields nothing rather than one empty chunk: the playurl API
 * reports a length of zero for a video it would not serve, and asking a model to
 * transcribe no audio is a request that can only fail.
 *
 * Chunks are contiguous and cover the track exactly once. The overlap between
 * them is `audioStart`/`audioEnd` only — acoustic padding, not ownership.
 */
export function planChunks(
  duration: number,
  { span = CHUNK_SPAN_S, pad = CHUNK_PAD_S, lead = LEAD_SPAN_S, playhead = 0 }: PlanOptions = {},
): Chunk[] {
  if (!(duration > 0)) return []

  const points = boundaries(duration, span, pad, lead, playhead)
  const chunks: Chunk[] = []
  for (let at = 0; at < points.length - 1; at++) {
    const [start, end] = [points[at], points[at + 1]]
    chunks.push({
      index: at,
      start,
      end,
      audioStart: Math.max(0, start - pad),
      audioEnd: Math.min(duration, end + pad),
    })
  }
  return chunks
}

/**
 * One chunk covering an arbitrary stretch, for work picked up rather than planned.
 *
 * A resumed run is handed the stretches a previous one could not transcribe, and
 * must not re-derive them from `planChunks` — the plan depends on where playback
 * was when it was made, so the second run would cut the track differently and
 * the gaps would name the wrong audio.
 */
export function chunkFor(
  [start, end]: [number, number],
  index: number,
  duration: number,
  pad = CHUNK_PAD_S,
): Chunk {
  return {
    index,
    start,
    end,
    audioStart: Math.max(0, start - pad),
    audioEnd: Math.min(duration, end + pad),
  }
}

/**
 * The stretches of the track **not** left to do, given what still is.
 *
 * Phrased as the complement rather than accumulated as chunks finish, because it
 * then reads the same for a fresh run and for one resuming with most of the
 * track already in hand — in both cases what is covered is simply everything
 * outside the work outstanding. Adjacent stretches merge on the way out, so ten
 * finished chunks report as one span rather than ten.
 */
export function coverageExcept(pending: Iterable<Chunk>, duration: number): Array<[number, number]> {
  const holes = [...pending].sort((a, b) => a.start - b.start)
  const covered: Array<[number, number]> = []

  let cursor = 0
  for (const hole of holes) {
    if (hole.start > cursor) covered.push([cursor, hole.start])
    cursor = Math.max(cursor, hole.end)
  }
  if (duration > cursor) covered.push([cursor, duration])

  return covered
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
 * The chunk to transcribe next: the one at or after the playhead, wrapping.
 *
 * `pickBatch`'s rule (llm/batch.ts) at chunk granularity, and it earns its keep
 * the same way — asked again before every chunk rather than computed once for
 * the run, so seeking re-orders what is left with no machinery for it. Null when
 * nothing is left.
 */
export function nextChunk(remaining: Iterable<Chunk>, playhead: number): Chunk | null {
  let ahead: Chunk | null = null
  let lowest: Chunk | null = null

  for (const chunk of remaining) {
    if (!lowest || chunk.start < lowest.start) lowest = chunk
    // Contains the playhead, or lies entirely after it.
    if (chunk.end > playhead && (!ahead || chunk.start < ahead.start)) ahead = chunk
  }

  return ahead ?? lowest
}

/**
 * Cues from every chunk done so far, in track order and one per start.
 *
 * Sorted rather than appended because chunks are transcribed playhead-first and
 * therefore arrive out of order.
 *
 * The deduplication is what makes `start` usable as a cue's identity, which
 * everything downstream now depends on: the overlay keys its translation caches
 * by it so that a chunk landing in the middle of the track cannot renumber the
 * lines around it. Two chunks cannot collide — `ownedCues` partitions by start —
 * so this only guards against one chunk reporting two segments at one timestamp.
 */
export function mergeCues(chunks: Iterable<Cue[]>): Cue[] {
  const sorted = [...chunks].flat().sort((a, b) => a.start - b.start)
  return sorted.filter((cue, at) => at === 0 || cue.start !== sorted[at - 1].start)
}
