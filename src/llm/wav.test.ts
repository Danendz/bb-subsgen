import { describe, expect, test } from 'vitest'
import { ASR_SAMPLE_RATE, downmixToMono, encodeWav, sliceSeconds, wavBytesFor } from './wav'

async function bytesOf(blob: Blob): Promise<DataView> {
  return new DataView(await blob.arrayBuffer())
}

function ascii(view: DataView, at: number, length: number): string {
  let text = ''
  for (let i = 0; i < length; i++) text += String.fromCharCode(view.getUint8(at + i))
  return text
}

describe('encodeWav', () => {
  test('writes a RIFF/WAVE header a decoder will accept', async () => {
    const view = await bytesOf(encodeWav(new Float32Array(4)))
    expect(ascii(view, 0, 4)).toBe('RIFF')
    expect(ascii(view, 8, 4)).toBe('WAVE')
    expect(ascii(view, 12, 4)).toBe('fmt ')
    expect(ascii(view, 36, 4)).toBe('data')
  })

  test('declares uncompressed mono PCM at the rate given', async () => {
    const view = await bytesOf(encodeWav(new Float32Array(4), 16_000))
    expect(view.getUint16(20, true)).toBe(1) // PCM
    expect(view.getUint16(22, true)).toBe(1) // mono
    expect(view.getUint32(24, true)).toBe(16_000)
    expect(view.getUint16(34, true)).toBe(16) // bits per sample
    expect(view.getUint32(28, true)).toBe(32_000) // byte rate
  })

  test('declares sizes that match the bytes actually written', async () => {
    // A mismatch here is the classic way a WAV plays as noise or is rejected
    // outright, and it is invisible until something else tries to read it.
    const blob = encodeWav(new Float32Array(100))
    const view = await bytesOf(blob)
    expect(blob.size).toBe(44 + 200)
    expect(view.getUint32(40, true)).toBe(200) // data chunk
    expect(view.getUint32(4, true)).toBe(blob.size - 8) // RIFF chunk
  })

  test('converts samples to signed 16-bit', async () => {
    const view = await bytesOf(encodeWav(Float32Array.from([0, 1, -1])))
    expect(view.getInt16(44, true)).toBe(0)
    expect(view.getInt16(46, true)).toBe(32767)
    expect(view.getInt16(48, true)).toBe(-32768)
  })

  test('clamps rather than wrapping, so a peak is not a click', async () => {
    // Resampling can push a sample past ±1, and wrapping turns the loudest
    // moment of a line into a transient the model hears as a consonant.
    const view = await bytesOf(encodeWav(Float32Array.from([2, -2])))
    expect(view.getInt16(44, true)).toBe(32767)
    expect(view.getInt16(46, true)).toBe(-32768)
  })

  test('handles empty audio without producing a malformed file', async () => {
    const blob = encodeWav(new Float32Array(0))
    expect(blob.size).toBe(44)
    expect((await bytesOf(blob)).getUint32(40, true)).toBe(0)
  })
})

/** An AudioBuffer, as much of one as downmixing looks at. */
function channels(...data: number[][]) {
  return {
    numberOfChannels: data.length,
    length: data[0].length,
    getChannelData: (at: number) => Float32Array.from(data[at]),
  }
}

describe('downmixToMono', () => {
  test('averages the channels rather than picking one', async () => {
    // Dialogue is normally centred, so both channels carry it. Taking the left
    // channel alone throws away half the signal on the only thing being heard.
    const mono = downmixToMono(channels([1, 0, 0.5], [0, 1, 0.5]))
    expect(Array.from(mono)).toEqual([0.5, 0.5, 0.5])
  })

  test('passes mono audio straight through', () => {
    const mono = downmixToMono(channels([0.25, -0.25]))
    expect(Array.from(mono)).toEqual([0.25, -0.25])
  })

  test('copes with more than two channels', () => {
    const mono = downmixToMono(channels([1, 1], [0, 1], [-1, 1], [0, 1]))
    expect(Array.from(mono)).toEqual([0, 1])
  })
})

describe('sliceSeconds', () => {
  const samples = Float32Array.from({ length: 16_000 * 4 }, (_, at) => at)

  test('takes the samples covering a stretch of the track', () => {
    const slice = sliceSeconds(samples, 1, 2, 16_000)
    expect(slice.length).toBe(16_000)
    expect(slice[0]).toBe(16_000)
  })

  test('stops at the end of the audio rather than past it', () => {
    // The last chunk of a track always asks for more than there is.
    expect(sliceSeconds(samples, 3, 99, 16_000).length).toBe(16_000)
  })

  test('returns nothing for a stretch beyond the end', () => {
    expect(sliceSeconds(samples, 10, 20, 16_000).length).toBe(0)
  })
})

describe('wavBytesFor', () => {
  test('reports what a stretch of audio will weigh', () => {
    expect(wavBytesFor(1, 16_000)).toBe(44 + 32_000)
    // A five-minute chunk at the ASR rate — about 9.6MB, which is the number
    // that makes chunking a memory decision as well as a progress one.
    expect(wavBytesFor(300, ASR_SAMPLE_RATE)).toBe(44 + 9_600_000)
  })
})
