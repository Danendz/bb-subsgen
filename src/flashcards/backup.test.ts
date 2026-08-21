import { describe, expect, test } from 'vitest'
import { conflictsOf, emptyBackup, isBackup, merge, replay, upgrade, type Backup } from './backup'
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

/**
 * A version 1 file, as one exported before the rename actually looks.
 *
 * Written past the current types on purpose: the whole point of `upgrade` is
 * reading a shape the types no longer describe.
 */
function v1(partial: Record<string, unknown>): Backup {
  return { ...emptyBackup(), version: 1, ...partial } as unknown as Backup
}

describe('upgrade', () => {
  test('moves bvid onto videoId for per-video words', () => {
    const upgraded = upgrade(v1({ videoWords: [{ bvid: 'BV1xx', headword: '憔悴', count: 4 }] }))
    expect(upgraded.videoWords).toEqual([{ videoId: 'BV1xx', headword: '憔悴', count: 4 }])
  })

  test('moves it for watched videos, keeping the rest of the row', () => {
    const upgraded = upgrade(
      v1({
        videos: [
          {
            bvid: 'BV1xx',
            title: '航拍中国',
            url: 'https://x',
            firstWatched: 1,
            lastWatched: 2,
            lines: 9,
          },
        ],
      }),
    )
    expect(upgraded.videos).toEqual([
      {
        videoId: 'BV1xx',
        title: '航拍中国',
        url: 'https://x',
        firstWatched: 1,
        lastWatched: 2,
        lines: 9,
      },
    ])
  })

  test('moves it inside every context a card carries', () => {
    const upgraded = upgrade(
      v1({
        items: [
          {
            ...word('憔悴'),
            contexts: [{ text: '他很憔悴。', translation: 'Haggard.', at: 1, bvid: 'BV1xx' }],
          },
        ],
      }),
    )
    expect(upgraded.items[0].contexts[0].videoId).toBe('BV1xx')
    expect('bvid' in upgraded.items[0].contexts[0]).toBe(false)
  })

  test('leaves a reader context alone, because it never had one', () => {
    const context = { text: '他很憔悴。', translation: 'Haggard.', at: 1, url: 'https://zhihu.com' }
    const upgraded = upgrade(v1({ items: [{ ...word('憔悴'), contexts: [context] }] }))
    expect(upgraded.items[0].contexts[0]).toEqual(context)
  })

  test('is idempotent, so a current file passes through untouched', () => {
    const current = backup({ videoWords: [{ videoId: 'BV1xx', headword: '憔悴', count: 4 }] })
    expect(upgrade(current)).toBe(current)
  })

  test('tolerates a file missing the video arrays entirely', () => {
    // `isBackup` only insists on items and reviews, so the rest may be absent —
    // and an import that threw here would take the whole deck with it.
    const upgraded = upgrade(v1({ videoWords: undefined, videos: undefined }))
    expect(upgraded.videoWords).toEqual([])
    expect(upgraded.videos).toEqual([])
  })
})

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

    // Three rungs climbed from the bottom: 1, 3, 7 days.
    expect(rebuilt.reps).toBe(3)
    expect(rebuilt.level).toBe(3)
    expect(rebuilt.interval).toBe(7)
    expect(rebuilt.state).toBe('review')
  })

  test('a card with no reviews is left un-introduced', () => {
    const rebuilt = replay(word('学习', { introducedAt: 123 }), [])
    expect(rebuilt.introducedAt).toBeUndefined()
    expect(rebuilt.state).toBe('new')
  })

  test('introducedAt comes from the earliest review, whatever order they arrive in', () => {
    const rebuilt = replay(word('学习'), [review('学习', DAY0 + DAY_MS), review('学习', DAY0)])
    expect(rebuilt.introducedAt).toBe(DAY0)
  })

  test('ignores reviews belonging to other cards', () => {
    const rebuilt = replay(word('学习'), [review('中文', DAY0), review('学习', DAY0)])
    expect(rebuilt.reps).toBe(1)
  })

  describe('extra practice', () => {
    const drill = (text: string, at: number, grade: Review['grade'] = 'good'): Review => ({
      ...review(text, at, grade),
      extra: true,
    })

    test('a correct drill replays as though it were not there', () => {
      // The store and the replay have to reach the same verdict, or importing
      // would rebuild a schedule the browser that recorded it never had.
      const log = [review('学习', DAY0), review('学习', DAY0 + DAY_MS)]
      const drilled = replay(word('学习'), [...log, drill('学习', DAY0 + 2 * DAY_MS)])
      const clean = replay(word('学习'), log)

      expect(drilled.level).toBe(clean.level)
      expect(drilled.interval).toBe(clean.interval)
      expect(drilled.due).toBe(clean.due)
      expect(drilled.state).toBe(clean.state)
    })

    test('but it is still counted as having been asked', () => {
      const rebuilt = replay(word('学习'), [review('学习', DAY0), drill('学习', DAY0 + DAY_MS)])
      expect(rebuilt.reps).toBe(2)
    })

    test('a failed drill replays as an ordinary lapse', () => {
      const climb = [DAY0, DAY0 + DAY_MS, DAY0 + 4 * DAY_MS].map((at) => review('学习', at))
      const rebuilt = replay(word('学习'), [...climb, drill('学习', DAY0 + 5 * DAY_MS, 'again')])

      expect(rebuilt.level).toBe(2)
      expect(rebuilt.lapses).toBe(1)
      expect(rebuilt.state).toBe('learning')
    })

    test('introducedAt comes from the first review that moved the card', () => {
      // A card is introduced by being scheduled; being drilled is not the same
      // event, and the daily intake limits count these.
      const rebuilt = replay(word('学习'), [drill('学习', DAY0), review('学习', DAY0 + DAY_MS)])
      expect(rebuilt.introducedAt).toBe(DAY0 + DAY_MS)
    })

    test('survives an export and import unchanged', () => {
      const local = backup({
        items: [word('学习', { state: 'review', interval: 3, level: 2 })],
        reviews: [review('学习', DAY0), review('学习', DAY0 + DAY_MS)],
      })
      const merged = merge(local, backup({ reviews: [drill('学习', DAY0 + 2 * DAY_MS)] }), {
        prefer: 'local',
      })

      expect(merged.items[0].interval).toBe(replay(word('学习'), local.reviews).interval)
      expect(merged.items[0].reps).toBe(3)
    })
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
    const video = {
      videoId: 'BV1',
      title: 'A',
      url: 'u',
      firstWatched: 200,
      lastWatched: 300,
      lines: 40,
    }
    const merged = merge(
      backup({ videos: [video] }),
      backup({ videos: [{ ...video, firstWatched: 100, lastWatched: 150, lines: 10 }] }),
      options,
    )
    expect(merged.videos[0]).toMatchObject({ lines: 50, firstWatched: 100, lastWatched: 300 })
  })

  test('sums per-video word counts', () => {
    const merged = merge(
      backup({ videoWords: [{ videoId: 'BV1', headword: '我', count: 3 }] }),
      backup({ videoWords: [{ videoId: 'BV1', headword: '我', count: 4 }] }),
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

  describe('the intake pool', () => {
    test('a pooled word imports as pooled', () => {
      const merged = merge(
        backup({ items: [word('憔悴', { state: 'pool' })] }),
        backup({ items: [word('憔悴', { state: 'pool' })] }),
        options,
      )
      expect(merged.items[0].state).toBe('pool')
    })

    test('a lookup on the other machine takes the word out of the pool', () => {
      // Which browser you happen to import into is not a fact about the card.
      const watched = backup({ items: [word('憔悴', { state: 'pool' })] })
      const studied = backup({ items: [word('憔悴', { state: 'new' })] })

      expect(merge(watched, studied, options).items[0].state).toBe('new')
      expect(merge(studied, watched, options).items[0].state).toBe('new')
    })

    test('a pooled word that was studied elsewhere gets its schedule', () => {
      const merged = merge(
        backup({ items: [word('憔悴', { state: 'pool' })] }),
        backup({ items: [word('憔悴')], reviews: [review('憔悴', DAY0)] }),
        options,
      )
      expect(merged.items[0].state).toBe('review')
      expect(merged.items[0].reps).toBe(1)
    })

    test('leaving the pool does not override a discarded declaration', () => {
      // The overrule still has to come from the side that did not declare it,
      // or importing would reinstate the "known" the user just discarded.
      const local = backup({ items: [word('我', { state: 'known' })] })
      const incoming = backup({ items: [word('我', { state: 'pool' })] })
      expect(merge(local, incoming, { prefer: 'incoming' }).items[0].state).toBe('pool')
      expect(merge(local, incoming, { prefer: 'local' }).items[0].state).toBe('known')
    })
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
