import { useCallback, useState } from 'preact/hooks'
import { flashcardsDb } from '../flashcards/db'
import { knownSetOf, listItems, listVideos, videoWords } from '../flashcards/queries'
import { coverageOf, fraction, type Coverage } from '../flashcards/capture'
import { lookupDefs } from '../shared/dict-client'
import { loadSettings, resolveStudyLang } from '../shared/settings'
import { packFor } from '../lang/packs'
import { Pinyin } from './pinyin'
import type { Video, VideoWord } from '../flashcards/types'
import { navigate, useAsync } from './hooks'
import { canSpeak, speak } from '../shared/speak'
import { useT } from '../i18n/useT'
import type { MessageKey } from '../i18n/keys'

/** Senses per word in the list. The row is one line tall; a third would clip. */
const SENSES = 2

/**
 * How followable a video is, from running-word coverage.
 *
 * These thresholds are about *tokens*, not distinct words: below roughly 90% of
 * running words known, comprehension falls apart; above ~95% you can follow
 * along and infer the rest. The distinct-word figure is always far lower and
 * would call a perfectly watchable video hopeless.
 */
function verdict(tokenCoverage: number): { label: MessageKey; tone: string } {
  if (tokenCoverage >= 0.95) return { label: 'videos.verdict.comfortable', tone: 'good' }
  if (tokenCoverage >= 0.9) return { label: 'videos.verdict.stretch', tone: 'warn' }
  return { label: 'videos.verdict.hard', tone: '' }
}

function CoverageBar({ coverage }: { coverage: Coverage }) {
  const { t } = useT()
  const tokens = fraction(coverage.knownTokens, coverage.totalTokens)
  const { label, tone } = verdict(tokens)
  return (
    <>
      <div class={`bar ${tone}`}>
        <i style={{ width: `${Math.round(tokens * 100)}%` }} />
      </div>
      <div class="muted small">
        {t('videos.coverage', {
          percent: Math.round(tokens * 100),
          verdict: t(label),
          known: coverage.knownTypes,
          total: coverage.totalTypes,
        })}
      </div>
    </>
  )
}

function VideoList() {
  const { t } = useT()
  const load = useCallback(async () => {
    const db = await flashcardsDb()
    const lang = resolveStudyLang(await loadSettings())
    const [items, videos] = await Promise.all([listItems(db, lang), listVideos(db)])
    const known = knownSetOf(items)
    const coverage = new Map<string, Coverage>()
    // A video is a place you watched, not a language, so which videos belong to
    // this list is derived from the words captured from them — a genuinely
    // bilingual one appears under both, scored correctly in each. Listing a
    // video with nothing captured in this language would render it as "0% of
    // what is said — you know 0 of 0 distinct words here."
    const shown: Video[] = []
    for (const video of videos) {
      const words = await videoWords(db, video.videoId, lang)
      if (!words.length) continue
      coverage.set(video.videoId, coverageOf(words, known))
      shown.push(video)
    }
    return { videos: shown, coverage }
  }, [])
  const { data, loading } = useAsync(load)

  if (loading) return <p class="muted">{t('common.loading')}</p>
  if (!data?.videos.length) {
    return (
      <div class="empty">
        <p>{t('videos.emptyTitle')}</p>
        <p class="small">{t('videos.emptyBody')}</p>
      </div>
    )
  }

  const ordered = [...data.videos].sort((a, b) => b.lastWatched - a.lastWatched)

  return (
    <div class="panel">
      {ordered.map((video) => (
        <div class="row" key={video.videoId}>
          <div class="grow">
            <a
              href={`#/videos/${video.videoId}`}
              onClick={(e) => {
                e.preventDefault()
                navigate(`/videos/${video.videoId}`)
              }}
            >
              {video.title || video.videoId}
            </a>
            <div style={{ marginTop: 6 }}>
              <CoverageBar coverage={data.coverage.get(video.videoId)!} />
            </div>
          </div>
          <span class="muted small">{t('videos.lines', { count: video.lines })}</span>
        </div>
      ))}
    </div>
  )
}

function VideoDetail({ videoId }: { videoId: string }) {
  const { t } = useT()
  const [limit, setLimit] = useState(80)

  const load = useCallback(async () => {
    const db = await flashcardsDb()
    const lang = resolveStudyLang(await loadSettings())
    const [items, videos, words] = await Promise.all([
      listItems(db, lang),
      listVideos(db),
      videoWords(db, videoId, lang),
    ])
    return {
      video: videos.find((v) => v.videoId === videoId) ?? null,
      words: [...words].sort((a, b) => b.count - a.count),
      known: knownSetOf(items),
      pack: packFor(lang),
    }
  }, [videoId])
  const { data, loading } = useAsync(load)

  const page: VideoWord[] = data?.words.slice(0, limit) ?? []
  const loadDefs = useCallback(async () => {
    const settings = await loadSettings()
    return lookupDefs(
      resolveStudyLang(settings),
      page.map((w) => w.headword),
      settings.useTraditional,
    )
  }, [page.map((w) => w.headword).join(' ')])
  const { data: defs } = useAsync(loadDefs)

  if (loading) return <p class="muted">{t('common.loading')}</p>
  if (!data?.video) return <p class="muted">{t('videos.unknown')}</p>

  const coverage = coverageOf(data.words, data.known)

  return (
    <>
      <div class="toolbar">
        <button onClick={() => navigate('/videos')}>{t('videos.back')}</button>
        <div class="grow" />
        <a href={data.video.url} target="_blank" rel="noreferrer">
          {t('videos.openOnBilibili')}
        </a>
      </div>

      <div class="panel">
        <strong>{data.video.title || videoId}</strong>
        <div style={{ marginTop: 8 }}>
          <CoverageBar coverage={coverage} />
        </div>
      </div>

      <div class="panel">
        {page.map((word) => {
          const entries = defs?.[word.headword]
          const [primary] = data.pack?.rank(entries ?? [], word.headword) ?? []
          return (
            <div class="row" key={word.headword}>
              <span class="hanzi">{word.headword}</span>
              <Pinyin parts={primary?.reading ?? []} />
              <span class="grow gloss">
                {primary?.senses
                  .slice(0, SENSES)
                  .map((sense) => sense.gloss)
                  .join('; ') ?? ''}
              </span>
              <span class="muted small">{t('videos.times', { count: word.count })}</span>
              {canSpeak() && (
                <button
                  class="icon-btn"
                  title={t('videos.speak')}
                  onClick={() => speak(word.headword)}
                >
                  ♪
                </button>
              )}
              {data.known.has(word.headword) && <span class="tag known">{t('videos.known')}</span>}
            </div>
          )
        })}
      </div>

      {data.words.length > page.length && (
        <p>
          <button onClick={() => setLimit((n) => n + 80)}>
            {t('videos.showMore', { count: data.words.length - page.length })}
          </button>
        </p>
      )}
    </>
  )
}

export function Videos({ videoId }: { videoId?: string }) {
  return videoId ? <VideoDetail videoId={videoId} /> : <VideoList />
}
