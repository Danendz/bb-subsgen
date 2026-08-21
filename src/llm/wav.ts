// Writing 16-bit mono PCM into a WAV container.
//
// The one format every speech-recognition server accepts without shelling out to
// a decoder. Bilibili serves AAC, and while most servers will take that, the
// ones that do so by invoking ffmpeg fail in ways that are invisible from here —
// so the audio is decoded in the browser, which has an AAC decoder already, and
// handed over as something nothing has to interpret.
//
// Mono 16kHz is not a compromise: it is what speech recognition takes. Whisper
// resamples to exactly this internally, so sending anything richer only means
// sending more bytes for it to discard.

/** What every speech model in this space expects, and what the resampler targets. */
export const ASR_SAMPLE_RATE = 16_000

const HEADER_BYTES = 44

/**
 * One WAV file, as a blob ready to post.
 *
 * Samples are clamped rather than scaled: a decoded stream can exceed ±1 after
 * resampling, and wrapping those around is an audible click on every peak, which
 * a model hears as a consonant that was never spoken.
 */
export function encodeWav(samples: Float32Array, sampleRate = ASR_SAMPLE_RATE): Blob {
  const buffer = new ArrayBuffer(HEADER_BYTES + samples.length * 2)
  const view = new DataView(buffer)

  const ascii = (at: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(at + i, text.charCodeAt(i))
  }

  const dataBytes = samples.length * 2

  ascii(0, 'RIFF')
  view.setUint32(4, 36 + dataBytes, true)
  ascii(8, 'WAVE')

  ascii(12, 'fmt ')
  view.setUint32(16, 16, true) // subchunk size, PCM
  view.setUint16(20, 1, true) // format: uncompressed PCM
  view.setUint16(22, 1, true) // channels: mono
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true) // byte rate
  view.setUint16(32, 2, true) // block align
  view.setUint16(34, 16, true) // bits per sample

  ascii(36, 'data')
  view.setUint32(40, dataBytes, true)

  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]))
    // Asymmetric on purpose: signed 16-bit runs to -32768 but only +32767, and
    // using the same factor for both is a clipped positive peak.
    view.setInt16(HEADER_BYTES + i * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true)
  }

  return new Blob([buffer], { type: 'audio/wav' })
}

/** A decoded WAV: the samples, and the rate they were recorded at. */
export interface DecodedWav {
  samples: Float32Array
  sampleRate: number
  channels: number
}

const ascii = (view: DataView, at: number) =>
  String.fromCharCode(
    view.getUint8(at),
    view.getUint8(at + 1),
    view.getUint8(at + 2),
    view.getUint8(at + 3),
  )

/**
 * Reads 16-bit PCM out of a WAV container, or null if it isn't one.
 *
 * The counterpart to `encodeWav`, and it exists so that audio arriving already
 * at the ASR rate — from the local helper, which has ffmpeg do the resampling —
 * skips `decodeAudioData` entirely. That matters for more than tidiness: the
 * `OfflineAudioContext` path holds the source's own channels and rate briefly
 * before the downmix, which `offscreen/main.ts` documents as peaking in the high
 * hundreds of megabytes on a long episode. This path is one flat copy.
 *
 * Two things here are written against a real streamed file rather than against
 * the spec, and both would break a textbook parser:
 *
 *   - **The chunks are walked, not assumed.** The canonical layout puts `data`
 *     at byte 44. ffmpeg writes a `LIST`/`INFO` chunk naming itself first, which
 *     on a measured file put the audio at byte 78.
 *   - **The declared sizes are ignored.** Writing WAV to a pipe means ffmpeg
 *     cannot seek back to fill in the lengths, so it leaves `0xFFFFFFFF` in both
 *     the RIFF size and the `data` size. Trusting either yields a wildly wrong
 *     length; what is actually there is the rest of the buffer.
 */
export function decodeWav(bytes: ArrayBuffer): DecodedWav | null {
  if (bytes.byteLength < 44) return null
  const view = new DataView(bytes)
  if (ascii(view, 0) !== 'RIFF' || ascii(view, 8) !== 'WAVE') return null

  let format = 0
  let channels = 0
  let sampleRate = 0
  let bitsPerSample = 0

  let at = 12
  while (at + 8 <= bytes.byteLength) {
    const id = ascii(view, at)
    const declared = view.getUint32(at + 4, true)
    const body = at + 8

    if (id === 'fmt ' && body + 16 <= bytes.byteLength) {
      format = view.getUint16(body, true)
      channels = view.getUint16(body + 2, true)
      sampleRate = view.getUint32(body + 4, true)
      bitsPerSample = view.getUint16(body + 14, true)
    } else if (id === 'data') {
      // Whatever is left, for the streaming reason above.
      const available = bytes.byteLength - body
      const length = declared === 0xffffffff || declared > available ? available : declared
      if (format !== 1 || bitsPerSample !== 16 || channels < 1) return null

      const count = Math.floor(length / 2)
      const samples = new Float32Array(count)
      for (let i = 0; i < count; i++) {
        const sample = view.getInt16(body + i * 2, true)
        samples[i] = sample < 0 ? sample / 0x8000 : sample / 0x7fff
      }
      return { samples, sampleRate, channels }
    }

    // Chunks are word-aligned: an odd size is followed by a pad byte.
    at = body + declared + (declared % 2)
    // A declared size that overflows the buffer means the header is lying or
    // truncated; walking past the end would loop forever on the arithmetic.
    if (declared === 0xffffffff || at <= body) return null
  }
  return null
}

/**
 * The shape of an `AudioBuffer`, as much of it as downmixing needs.
 *
 * Structural rather than the real type so this can be tested without a DOM —
 * `AudioBuffer` cannot be constructed outside a browser, and the mixing itself
 * is arithmetic that has nothing to do with the platform.
 */
export interface ChannelSource {
  numberOfChannels: number
  length: number
  getChannelData(channel: number): Float32Array
}

/**
 * One channel out of however many there were.
 *
 * Averaged rather than taking the left channel: dialogue is normally centred, so
 * both channels carry it, and discarding one throws away half the signal-to-noise
 * on the only thing being listened for. Music panned hard to one side is the
 * case that makes the difference audible.
 */
export function downmixToMono(buffer: ChannelSource): Float32Array {
  if (buffer.numberOfChannels === 1) return buffer.getChannelData(0)

  const channels = Array.from({ length: buffer.numberOfChannels }, (_, at) =>
    buffer.getChannelData(at),
  )
  const mono = new Float32Array(buffer.length)
  for (let i = 0; i < mono.length; i++) {
    let sum = 0
    for (const channel of channels) sum += channel[i]
    mono[i] = sum / channels.length
  }
  return mono
}

/** The samples covering a stretch of the track, as a view rather than a copy. */
export function sliceSeconds(
  samples: Float32Array,
  from: number,
  to: number,
  sampleRate = ASR_SAMPLE_RATE,
): Float32Array {
  const start = Math.max(0, Math.floor(from * sampleRate))
  const end = Math.min(samples.length, Math.ceil(to * sampleRate))
  return end > start ? samples.subarray(start, end) : new Float32Array(0)
}

/** Bytes one stretch of audio will take, for deciding whether to bother splitting it. */
export function wavBytesFor(seconds: number, sampleRate = ASR_SAMPLE_RATE): number {
  return HEADER_BYTES + Math.ceil(seconds * sampleRate) * 2
}
