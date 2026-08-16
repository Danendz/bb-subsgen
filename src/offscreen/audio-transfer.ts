// Getting downloaded audio from a content script to the offscreen document.
//
// It has to be encoded, and that is not a choice. Chrome serializes extension
// messages as JSON: a `Blob` or an `ArrayBuffer` put on the bus arrives as `{}`,
// silently, with the failure surfacing much later as a missing method. Chrome
// 148 added `message_serialization: structured_clone`, which would carry a Blob
// by reference and make this file unnecessary — it was tried first and did not
// take effect, so this takes the encoding cost rather than depending on it.
//
// Base64 costs a third more bytes than the audio itself. The alternative on a
// JSON channel is an array of numbers, which costs three to four times more, so
// this is the cheap option rather than a good one.
//
// The bytes are cut into slices rather than sent whole because a fifty-minute
// episode is around 25MB, which is 33MB encoded, and one message that size is
// both a single large allocation at each end and uncomfortably close to what the
// message bus will carry. Slices keep the peak to one slice at a time.

/** Raw bytes per message, before encoding. Chosen so a slice encodes to under 3MB. */
export const AUDIO_SLICE_BYTES = 2 * 1024 * 1024

/**
 * Base64 of some bytes.
 *
 * Built in blocks because `String.fromCharCode(...bytes)` spreads its argument
 * onto the stack, and a whole audio track's worth of arguments overflows it.
 */
export function toBase64(bytes: Uint8Array): string {
  const BLOCK = 0x8000
  let binary = ''
  for (let at = 0; at < bytes.length; at += BLOCK) {
    binary += String.fromCharCode(...bytes.subarray(at, at + BLOCK))
  }
  return btoa(binary)
}

/** The bytes some base64 stands for. */
export function fromBase64(text: string): Uint8Array {
  const binary = atob(text)
  const bytes = new Uint8Array(binary.length)
  for (let at = 0; at < binary.length; at += 1) bytes[at] = binary.charCodeAt(at)
  return bytes
}

export interface AudioSlice {
  data: string
  index: number
  total: number
}

/**
 * The slices to send, encoded one at a time as they are asked for.
 *
 * A generator rather than an array: the point of slicing is to hold one encoded
 * slice at a time, and returning them all at once would rebuild the whole
 * encoded copy this exists to avoid.
 *
 * Empty audio still yields one slice. A run that received nothing would
 * otherwise wait forever for a `total` it can never reach.
 */
export function* sliceAudio(
  bytes: Uint8Array,
  sliceBytes: number = AUDIO_SLICE_BYTES,
): Generator<AudioSlice> {
  const total = Math.max(1, Math.ceil(bytes.length / sliceBytes))
  for (let index = 0; index < total; index += 1) {
    yield {
      data: toBase64(bytes.subarray(index * sliceBytes, (index + 1) * sliceBytes)),
      index,
      total,
    }
  }
}

/**
 * Collects slices until the whole track has arrived.
 *
 * Keyed by index rather than appended, because the guarantee that matters here
 * is that the bytes end up in the order they were cut — not the order the
 * messages happened to land in.
 */
export function collectAudio(): {
  /** Adds a slice, and returns the whole track once the last one is in. */
  add: (slice: AudioSlice) => ArrayBuffer | null
} {
  const held = new Map<number, Uint8Array>()

  return {
    add(slice) {
      held.set(slice.index, fromBase64(slice.data))
      if (held.size < slice.total) return null

      const parts = Array.from({ length: slice.total }, (_, index) => held.get(index))
      // A missing part would mean a slice was lost rather than late, and joining
      // around the gap would hand the decoder audio with a hole in it.
      if (parts.some((part) => part === undefined)) return null

      const whole = new Uint8Array(parts.reduce((sum, part) => sum + part!.length, 0))
      let at = 0
      for (const part of parts) {
        whole.set(part!, at)
        at += part!.length
      }
      return whole.buffer
    },
  }
}
