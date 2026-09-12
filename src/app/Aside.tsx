// The right rail: what the deck looks like from outside a session.
//
// These numbers were a screen — `Overview.tsx`, the page `/` landed on. A stats
// dashboard is something you read rather than something you act on, and making
// it the front door meant the app opened on a report card. Beside the work they
// are glanceable, which is the only thing they were ever for.
//
// Three panels, in the order you care about them: what you did today, what is
// waiting, and where the words came from. "Waiting" means waiting *for a circle
// to open*: the words you have collected that the path cannot use yet, and the
// circle nearest to opening as the thing to press. `waiting()` answers both, in
// src/flashcards/path.ts, because the path screen asks the same question and
// two copies of that rule would be two copies nothing could test.
//
// Everything here derives from a single read. Four panels each calling
// `flashcardsDb()` would be four transactions and four spinners landing
// separately down one column. That read re-runs on `useDeckChanged` — see
// src/app/deck-signal.ts for why this screen cannot hear about a write any
// other way.

import { useCallback } from 'preact/hooks'
import { flashcardsDb } from '../flashcards/db'
import {
  deckCounts,
  knownSetOf,
  listItems,
  listRanks,
  listVideos,
  reviewsOn,
  studyStreak,
  videoWords,
} from '../flashcards/queries'
import { bandsFor, waiting } from '../flashcards/path'
import { packFor } from '../lang/packs'
import { loadSettings, resolveStudyLang } from '../shared/settings'
import type { Item } from '../flashcards/types'
import { useDeckChanged } from './deck-signal'
import { navigate, useAsync } from './hooks'
import { FlameIcon } from './icons'
import { useT } from '../i18n/useT'

/** Enough to recognise where you have been; the Videos tab has the rest. */
const RECENT_VIDEOS = 4

function pct(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0
}

function Stat({ n, label }: { n: number; label: string }) {
  const { lang } = useT()

  return (
    <div class="aside-stat">
      <span class="n">{n.toLocaleString(lang)}</span>
      <span class="label">{label}</span>
    </div>
  )
}

export function Aside() {
  const { t, lang } = useT()

  const load = useCallback(async () => {
    const db = await flashcardsDb()
    const studyLang = resolveStudyLang(await loadSettings())
    const [items, ranks, videos, streak, today] = await Promise.all([
      listItems(db, studyLang),
      listRanks(db, studyLang),
      listVideos(db),
      studyStreak(db),
      reviewsOn(db),
    ])

    // A video is a place you watched rather than a language, so which ones
    // belong here is derived from the words captured in this language — the
    // same rule the Videos screen follows.
    const recent = [...videos].sort((a, b) => b.lastWatched - a.lastWatched)
    const captured: Array<{ videoId: string; title: string; words: number }> = []
    for (const video of recent) {
      if (captured.length === RECENT_VIDEOS) break
      const words = await videoWords(db, video.videoId, studyLang)
      if (!words.length) continue
      captured.push({ videoId: video.videoId, title: video.title, words: words.length })
    }

    return { items, ranks, videos: captured, streak, today, lang: studyLang }
  }, [])

  const { data, reload } = useAsync(load)
  // Mounted by `Shell` and never unmounted, so without this it reads the deck
  // once on open and every number here is as old as the tab.
  useDeckChanged(reload)

  // No skeleton and no spinner: the aside is beside the work, and a column of
  // placeholders flashing next to what you came to do is worse than a column
  // that arrives a moment late.
  if (!data) return <aside class="aside" />

  const counts = deckCounts(data.items)
  const known = knownSetOf(data.items)
  const ranked = data.ranks.filter((rank) => rank.rank !== undefined)
  const discovered = ranked.filter((rank) => known.has(rank.headword)).length
  const studiable = counts.words - counts.known

  // The same banding the path screen draws, so "nearest circle" here and the
  // circle Learn opens on are the same circle.
  const deck = new Map(
    data.items.flatMap((item): Array<[string, Item]> =>
      item.kind === 'word' ? [[item.text, item]] : [],
    ),
  )
  const next = waiting(bandsFor(data.ranks, packFor(data.lang)?.sections), deck).next

  return (
    <aside class="aside">
      <div class="panel">
        <h2 class="aside-title">{t('aside.today')}</h2>
        <div class="aside-stats">
          <div class="aside-stat streak-stat">
            <span class="n">
              <FlameIcon />
              {data.streak.toLocaleString(lang)}
            </span>
            <span class="label">{t('aside.streakDays', { count: data.streak })}</span>
          </div>
          <Stat n={data.today} label={t('aside.reviewsToday', { count: data.today })} />
        </div>
      </div>

      <div class="panel">
        <h2 class="aside-title">{t('aside.deck')}</h2>
        <div class="aside-stats">
          <Stat n={counts.words} label={t('aside.stat.words')} />
          <Stat n={counts.known} label={t('aside.stat.known')} />
          <Stat n={counts.sentences} label={t('aside.stat.sentences')} />
          <Stat n={counts.grammar} label={t('aside.stat.grammar')} />
        </div>

        {ranked.length > 0 && (
          <div class="aside-progress">
            <div class="row">
              <span class="grow small">{t('aside.discovered')}</span>
              <span class="muted small">{pct(discovered, ranked.length)}%</span>
            </div>
            <div class="bar">
              <i style={{ width: `${pct(discovered, ranked.length)}%` }} />
            </div>
            <p class="muted small">
              {t('aside.discoveredOf', { found: discovered, total: ranked.length })}
            </p>
          </div>
        )}
      </div>

      <div class="panel">
        <h2 class="aside-title">{t('aside.waiting')}</h2>
        {studiable > 0 || counts.pool > 0 ? (
          <>
            <div class="aside-stats">
              <Stat n={studiable} label={t('aside.stat.toStudy')} />
              <Stat n={counts.pool} label={t('aside.stat.pool')} />
            </div>
            {next && (
              <p class="muted small">
                {t('aside.nextCircle', {
                  met: next.state.met,
                  total: next.circle.words.length,
                })}
              </p>
            )}
            <button class="wide" onClick={() => navigate(next ? '/' : '/review')}>
              {next ? t('aside.openPath') : t('aside.startReview')}
            </button>
          </>
        ) : (
          <p class="muted small">{t('aside.waitingEmpty')}</p>
        )}
      </div>

      <div class="panel">
        <h2 class="aside-title">{t('aside.fromVideos')}</h2>
        {data.videos.length ? (
          data.videos.map((video) => (
            <div class="row" key={video.videoId}>
              <a
                class="grow"
                href={`#/videos/${video.videoId}`}
                onClick={(e) => {
                  e.preventDefault()
                  navigate(`/videos/${video.videoId}`)
                }}
              >
                {video.title || video.videoId}
              </a>
              <span class="muted small">{t('aside.videoWords', { count: video.words })}</span>
            </div>
          ))
        ) : (
          <p class="muted small">{t('aside.noVideos')}</p>
        )}
      </div>
    </aside>
  )
}
