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
