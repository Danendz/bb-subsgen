import { describe, expect, test } from 'vitest'
import { conflictsOf, emptyBackup, isBackup, merge, replay, type Backup } from './backup'
import { DAY_MS } from './scheduler'
import type { Item, Review } from './types'

const DAY0 = Date.UTC(2026, 0, 1)

function word(text: string, extra: Partial<Item> = {}): Item {
  return {
    id: `w:${text}`,
    kind: 'word',
    text,
    state: 'new',
    interval: 0,
    ease: 2.5,
    due: DAY0,
    reps: 0,
    lapses: 0,
    createdAt: DAY0,
    contexts: [],
    ...extra,
  }
}

const review = (text: string, at: number, grade: Review['grade'] = 'good'): Review => ({
  itemId: `w:${text}`,
  at,
  grade,
  style: 'recognise',
  intervalBefore: 0,
  intervalAfter: 0,
})

function backup(partial: Partial<Backup>): Backup {
  return { ...emptyBackup(), ...partial }
}

describe('isBackup', () => {
  test('accepts a real export and rejects anything else', () => {
    expect(isBackup(emptyBackup())).toBe(true)
    expect(isBackup({ version: 1 })).toBe(false)
    expect(isBackup(null)).toBe(false)
    expect(isBackup('{}')).toBe(false)
  })
})

describe('replay', () => {
  test('rebuilds the schedule from the log alone', () => {
    const item = word('学习')
    const rebuilt = replay(item, [
      review('学习', DAY0),
      review('学习', DAY0 + DAY_MS),
      review('学习', DAY0 + 7 * DAY_MS),
    ])

    expect(rebuilt.reps).toBe(3)
    expect(rebuilt.interval).toBe(15)
    expect(rebuilt.state).toBe('review')
  })

  test('a card with no reviews is left un-introduced', () => {
    const rebuilt = replay(word('学习', { introducedAt: 123 }), [])
    expect(rebuilt.introducedAt).toBeUndefined()
    expect(rebuilt.state).toBe('new')
  })

  test('introducedAt comes from the earliest review, whatever order they arrive in', () => {
    const rebuilt = replay(word('学习'), [
      review('学习', DAY0 + DAY_MS),
      review('学习', DAY0),
    ])
    expect(rebuilt.introducedAt).toBe(DAY0)
  })

  test('ignores reviews belonging to other cards', () => {
    const rebuilt = replay(word('学习'), [review('中文', DAY0), review('学习', DAY0)])
    expect(rebuilt.reps).toBe(1)
  })
})

describe('merge', () => {
  const options = { prefer: 'local' as const }

  test('two halves of one history reconstruct the whole', () => {
    // The property that makes this a merge rather than a choice: reviews done
    // on the laptop and reviews done on the desktop both count, and the result
    // is the state you would have had using one browser throughout.
    const laptop = backup({
      items: [word('学习')],
      reviews: [review('学习', DAY0), review('学习', DAY0 + DAY_MS)],
    })
    const desktop = backup({
      items: [word('学习')],
      reviews: [review('学习', DAY0 + 7 * DAY_MS)],
    })
    const combined = backup({
      items: [word('学习')],
      reviews: [
        review('学习', DAY0),
        review('学习', DAY0 + DAY_MS),
        review('学习', DAY0 + 7 * DAY_MS),
      ],
    })

    const merged = merge(laptop, desktop, options)
    const straight = merge(combined, emptyBackup(), options)

    expect(merged.items[0].interval).toBe(straight.items[0].interval)
    expect(merged.items[0].reps).toBe(straight.items[0].reps)
    expect(merged.items[0].ease).toBeCloseTo(straight.items[0].ease)
  })

  test('neither side loses its study history', () => {
    const laptop = backup({ items: [word('学习')], reviews: [review('学习', DAY0)] })
    const desktop = backup({ items: [word('学习')], reviews: [review('学习', DAY0 + DAY_MS)] })

    expect(merge(laptop, desktop, options).reviews).toHaveLength(2)
    expect(merge(laptop, desktop, options).items[0].reps).toBe(2)
  })

  test('the same review present in both files is counted once', () => {
    // Exporting, importing, and exporting again must not inflate the history.
    const shared = review('学习', DAY0)
    const merged = merge(
      backup({ items: [word('学习')], reviews: [shared] }),
      backup({ items: [word('学习')], reviews: [{ ...shared }] }),
      options,
    )
    expect(merged.reviews).toHaveLength(1)
  })

  test('is order independent for the schedule', () => {
    const a = backup({ items: [word('学习')], reviews: [review('学习', DAY0)] })
    const b = backup({ items: [word('学习')], reviews: [review('学习', DAY0 + DAY_MS)] })

    expect(merge(a, b, options).items[0].interval).toBe(merge(b, a, options).items[0].interval)
  })

  test('carries across cards the other side has never seen', () => {
    const merged = merge(
      backup({ items: [word('学习')] }),
      backup({ items: [word('中文')] }),
      options,
    )
    expect(merged.items.map((i) => i.text).sort()).toEqual(['中文', '学习'])
  })

  test('sums exposure counts and widens the window', () => {
    const merged = merge(
      backup({ exposures: [{ headword: '我', count: 10, firstSeen: 100, lastSeen: 200 }] }),
      backup({ exposures: [{ headword: '我', count: 5, firstSeen: 50, lastSeen: 300 }] }),
      options,
    )
    expect(merged.exposures[0]).toEqual({
      headword: '我',
      count: 15,
      firstSeen: 50,
      lastSeen: 300,
    })
  })

  test('merges videos by id and adds up the lines watched', () => {
    const video = { bvid: 'BV1', title: 'A', url: 'u', firstWatched: 200, lastWatched: 300, lines: 40 }
    const merged = merge(
      backup({ videos: [video] }),
      backup({ videos: [{ ...video, firstWatched: 100, lastWatched: 150, lines: 10 }] }),
      options,
    )
    expect(merged.videos[0]).toMatchObject({ lines: 50, firstWatched: 100, lastWatched: 300 })
  })

  test('sums per-video word counts', () => {
    const merged = merge(
      backup({ videoWords: [{ bvid: 'BV1', headword: '我', count: 3 }] }),
      backup({ videoWords: [{ bvid: 'BV1', headword: '我', count: 4 }] }),
      options,
    )
    expect(merged.videoWords[0].count).toBe(7)
  })

  test('keeps the earliest discovery date', () => {
    const merged = merge(
      backup({ items: [word('学习', { createdAt: 500 })] }),
      backup({ items: [word('学习', { createdAt: 100 })] }),
      options,
    )
    expect(merged.items[0].createdAt).toBe(100)
  })

  test('unions the contexts a word was met in', () => {
    const context = (text: string) => ({ text, translation: '', at: 1 })
    const merged = merge(
      backup({ items: [word('学习', { contexts: [context('我在学习。')] })] }),
      backup({ items: [word('学习', { contexts: [context('他学习。')] })] }),
      options,
    )
    expect(merged.items[0].contexts).toHaveLength(2)
  })

  test('a declared known word survives replay', () => {
    // Replay describes what studying did; "I already know this" is not
    // something studying can contradict.
    const merged = merge(
      backup({ items: [word('我', { state: 'known' })] }),
      backup({ items: [word('我', { state: 'known' })], reviews: [review('我', DAY0)] }),
      options,
    )
    expect(merged.items[0].state).toBe('known')
  })

  describe('conflicts', () => {
    const local = backup({ items: [word('我', { state: 'known' }), word('学习')] })
    const incoming = backup({ items: [word('我'), word('学习')] })

    test('reports only genuine disagreements about what you know', () => {
      expect(conflictsOf(local, incoming)).toEqual([
        { id: 'w:我', text: '我', local: true, incoming: false },
      ])
    })

    test('a different schedule is not a conflict', () => {
      // That is exactly what replaying the merged log settles, so asking about
      // it would be asking the user to arbitrate something with a right answer.
      expect(
        conflictsOf(
          backup({ items: [word('学习', { state: 'review', interval: 30 })] }),
          backup({ items: [word('学习', { state: 'new' })] }),
        ),
      ).toEqual([])
    })

    test('prefer local keeps your own declaration', () => {
      expect(merge(local, incoming, { prefer: 'local' }).items[0].state).toBe('known')
    })

    test('prefer incoming takes the file’s', () => {
      const merged = merge(local, incoming, { prefer: 'incoming' })
      expect(merged.items.find((i) => i.text === '我')?.state).not.toBe('known')
    })

    test('agreement needs no arbitration either way', () => {
      const both = backup({ items: [word('我', { state: 'known' })] })
      expect(merge(both, both, { prefer: 'incoming' }).items[0].state).toBe('known')
    })
  })

  test('merging with an empty backup changes nothing material', () => {
    // Importing into a fresh browser is the common case and must be lossless.
    const source = backup({
      items: [word('学习')],
      reviews: [review('学习', DAY0)],
      exposures: [{ headword: '我', count: 3, firstSeen: 1, lastSeen: 2 }],
    })
    const merged = merge(emptyBackup(), source, options)

    expect(merged.items).toHaveLength(1)
    expect(merged.reviews).toHaveLength(1)
    expect(merged.exposures[0].count).toBe(3)
  })
})
