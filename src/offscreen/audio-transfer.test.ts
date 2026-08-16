import { describe, expect, test } from 'vitest'
import { collectAudio, fromBase64, sliceAudio, toBase64 } from './audio-transfer'

const bytesOf = (length: number) =>
  new Uint8Array(Array.from({ length }, (_, at) => (at * 7) % 256))

describe('base64', () => {
  test('round-trips arbitrary bytes, including the ones that are not text', () => {
    const bytes = bytesOf(1000)
    expect(fromBase64(toBase64(bytes))).toEqual(bytes)
  })

  /**
   * The reason `toBase64` works in blocks. Spreading a whole track onto the
   * stack throws `RangeError: Maximum call stack size exceeded`, and an audio
   * track is far larger than this.
   */
  test('encodes more bytes than fit in a call stack', () => {
    const bytes = bytesOf(300_000)
    expect(fromBase64(toBase64(bytes))).toEqual(bytes)
  })

  test('round-trips nothing', () => {
    expect(fromBase64(toBase64(new Uint8Array(0)))).toEqual(new Uint8Array(0))
  })
})

describe('sliceAudio', () => {
  test('cuts the bytes into slices that each know the count', () => {
    const slices = [...sliceAudio(bytesOf(250), 100)]
    expect(slices.map((slice) => slice.index)).toEqual([0, 1, 2])
    expect(slices.every((slice) => slice.total === 3)).toBe(true)
  })

  test('yields one slice for audio that fits in one', () => {
    expect([...sliceAudio(bytesOf(50), 100)]).toHaveLength(1)
  })

  /**
   * Not an academic case: the far end waits for `total` slices, so a track that
   * yielded none would leave a run waiting on a message that never comes.
   */
  test('yields one slice for no audio at all', () => {
    const slices = [...sliceAudio(new Uint8Array(0), 100)]
    expect(slices).toEqual([{ data: '', index: 0, total: 1 }])
  })
})

describe('collectAudio', () => {
  const wholeOf = (buffer: ArrayBuffer | null) => (buffer ? new Uint8Array(buffer) : null)

  test('holds its answer back until the last slice is in', () => {
    const bytes = bytesOf(250)
    const slices = [...sliceAudio(bytes, 100)]
    const collector = collectAudio()

    expect(collector.add(slices[0])).toBeNull()
    expect(collector.add(slices[1])).toBeNull()
    expect(wholeOf(collector.add(slices[2]))).toEqual(bytes)
  })

  test('rebuilds the track in the order it was cut, not the order it arrived', () => {
    const bytes = bytesOf(250)
    const [first, second, third] = [...sliceAudio(bytes, 100)]
    const collector = collectAudio()

    collector.add(third)
    collector.add(first)

    expect(wholeOf(collector.add(second))).toEqual(bytes)
  })

  test('carries a single-slice track straight through', () => {
    const bytes = bytesOf(40)
    const collector = collectAudio()
    expect(wholeOf(collector.add([...sliceAudio(bytes, 100)][0]))).toEqual(bytes)
  })

  /**
   * The failure this module exists because of, pinned down.
   *
   * Chrome serializes extension messages as JSON, and the first attempt at this
   * hop put a `Blob` on the bus. It arrived as `{}` — no error, no warning, just
   * a missing method several steps later. Sending the slices through JSON here
   * is the only way a test can tell that what crosses the bus is what was sent.
   */
  test('survives the JSON encoding the message bus puts it through', () => {
    const bytes = bytesOf(250)
    const collector = collectAudio()

    let whole: ArrayBuffer | null = null
    for (const slice of sliceAudio(bytes, 100)) {
      whole = collector.add(JSON.parse(JSON.stringify(slice)) as typeof slice)
    }

    expect(wholeOf(whole)).toEqual(bytes)
  })
})
