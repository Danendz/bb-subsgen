import { describe, expect, test } from 'vitest'
import { readerFor } from './wordlist-readers'

/** One `complete.min.json` entry, in the minified keys the real file uses. */
const entry = (s: string, q: number, l: string[]) => ({ s, q, l })

const payload = (entries: object[]) => JSON.stringify(entries)

const hsk30 = readerFor('hsk30')!
const frequency = readerFor('hsk30-frequency')!

describe('the hsk30 reader, reading frequency', () => {
  test('drops the words SUBTLEX never saw, rather than ranking them millionth', () => {
    // 93 of the real file's 11,470 entries carry q = 1000000 as a sentinel for
    // "not in the corpus". Kept, they sort to the end and take ranks, so the
    // deck would introduce 报亭 as merely uncommon rather than unmeasured.
    const rows = frequency(
      payload([entry('的', 1, ['n1']), entry('报亭', 1_000_000, ['n7']), entry('好', 20, ['n1'])]),
      'frequency',
    )

    expect(rows.map((row) => row.headword)).toEqual(['的', '好'])
  })

  test('re-ranks by position, because the file ranks 11,377 words with 9,113 numbers', () => {
    // `q` is a raw SUBTLEX rank with ties and gaps — 了 and 我 really do share
    // rank 3. Passed through, the Overview bar would report a denominator of a
    // million; positional ranks give it the number of words there actually are.
    const rows = frequency(
      payload([entry('我', 3, ['n1']), entry('的', 1, ['n1']), entry('了', 3, ['n1'])]),
      'frequency',
    )

    expect(rows).toEqual([
      { headword: '的', value: 1 },
      { headword: '我', value: 2 },
      { headword: '了', value: 3 },
    ])
  })
})

describe('the hsk30 reader, reading levels', () => {
  test('skips the entries that are only in the older lists', () => {
    // The file carries three level schemes at once. An entry tagged only `o*`
    // (HSK 2.0) or `t*` is in it for those, and has no 3.0 band to report —
    // filing it under a made-up level would put it on a progress bar it is not
    // part of.
    const rows = hsk30(
      payload([entry('阿姨', 4355, ['t3', 'o3']), entry('呵护', 13381, ['t7', 'n7'])]),
      'hsk',
    )

    expect(rows).toEqual([{ headword: '呵护', value: 7 }])
  })

  test('files a word at the earliest band it is taught in, not the last one listed', () => {
    const rows = hsk30(payload([entry('阿姨', 4355, ['t3', 'n4', 'o3'])]), 'hsk')

    expect(rows).toEqual([{ headword: '阿姨', value: 4 }])
  })

  test('ignores a row the payload got wrong instead of throwing the whole install away', () => {
    // Rows come off the network, so the shape is checked rather than trusted —
    // the same reason `cedict-row.ts` guards by hand.
    const rows = hsk30(
      payload([{ s: '好', l: ['n1'] }, entry('的', 1, ['n1']), { nonsense: true }]),
      'hsk',
    )

    expect(rows).toEqual([{ headword: '的', value: 1 }])
  })
})
