import type { SubtitleTrack } from './subtitles'

// Bilibili's own page state, so these are Bilibili's field names — `bvid` here
// is theirs and stays spelled that way. Absent entirely on bangumi.
//
// Read from a content script, which is an isolated world: the page's globals are
// not ours, so in practice this is `undefined` wherever we look at it. Every
// read of it is a fallback behind a real API call for exactly that reason.
interface InitialState {
  videoData?: {
    aid?: number
    cid?: number
    bvid?: string
    pages?: Array<{ cid: number }>
    subtitle?: { list?: SubtitleTrack[] }
  }
}

declare global {
  interface Window {
    __INITIAL_STATE__?: InitialState
  }
}

/**
 * What identifies a video to this extension: `BV1xx411c7mD`, or `ep335910` for
 * a bangumi episode.
 *
 * A plain alias rather than a branded type. This value is a database key, a URL
 * fragment and a log line, and all three want an ordinary string — the alias is
 * here to say *which* of the two shapes a parameter accepts, because they come
 * from different APIs and only one of them is a bvid. Bilibili's own `bvid`
 * request parameter keeps its name wherever it goes on the wire; see
 * `SubtitleFetchParams`.
 */
export type VideoId = string

/**
 * The video id in a URL, or null where there isn't one.
 *
 * Season URLs (`/bangumi/play/ss…`) parse to the season rather than an episode,
 * which is deliberately not the same identity: the canonical id is the `ep…`,
 * and resolving one from the other needs a network call this cannot make. What
 * it returns is enough for `watchVideoChange`, whose job is noticing a change
 * rather than naming the thing that changed — the resolver normalizes it before
 * anything is filed under it.
 */
export function parseVideoIdFromUrl(url: string): VideoId | null {
  const video = /\/video\/(BV[0-9A-Za-z]+)/.exec(url)
  if (video) return video[1]

  const bangumi = /\/bangumi\/play\/((?:ep|ss)\d+)/.exec(url)
  return bangumi?.[1] ?? null
}

/** Whether an id names a bangumi episode rather than an ordinary video. */
export function isEpisodeId(id: VideoId): boolean {
  return id.startsWith('ep') || id.startsWith('ss')
}

export function resolvePageNumber(url: string): number {
  const param = new URL(url).searchParams.get('p')
  const page = Number(param)
  return Number.isFinite(page) && page > 0 ? page : 1
}

export interface VideoInfo {
  aid: number
  cid: number
  /**
   * Title and description, for the translator's system prompt.
   *
   * Carried out of a call already being made: knowing a video is about cooking
   * rather than history is what stops a model picking the wrong sense of a word,
   * and it is the cheapest quality fix available to the translation pass.
   */
  title: string
  description: string
  /**
   * Runtime in seconds, or 0 where the API did not say.
   *
   * Carried because it is the only thing that makes a subtitle track's cue count
   * mean anything. One cue is a complete track on a ten-second clip and an advert
   * on a fifty-minute episode, and `looksLikeTranscript` cannot tell them apart
   * without knowing which it is looking at.
   *
   * Note the two APIs disagree on units — the view endpoint answers in seconds
   * and the pgc one in milliseconds — so both are converted here rather than
   * anywhere downstream.
   */
  duration: number
}

export interface ResolvedVideo extends VideoInfo {
  /**
   * The canonical id, which is not always the one that was asked for.
   *
   * Everything downstream files under this rather than under whatever the URL
   * happened to say, so there is exactly one id per video and a capture made
   * from one route matches a capture made from another.
   */
  videoId: VideoId
}

/**
 * Resolves aid/cid via the view API rather than `__INITIAL_STATE__`, which
 * is set by an inline page script and isn't reliably present when the
 * content script runs.
 *
 * Takes a bvid and not a `VideoId`: this is the ordinary-video endpoint, and the
 * parameter goes onto the wire under that name. Bangumi episodes are resolved by
 * `fetchEpisodeInfo`, which asks a different API entirely — and has to, since
 * they have no bvid and no `__INITIAL_STATE__` to fall back on.
 */
export async function fetchVideoInfo(bvid: string): Promise<VideoInfo | null> {
  const resp = await fetch(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`, {
    credentials: 'include',
  })
  const data = await resp.json()
  if (data.code !== 0) {
    console.warn('[bb-subsgen] view API failed:', data.message)
    return null
  }

  const cid = resolveCid({
    // On SPA navigation this is the most up-to-date cid when present.
    initialStateCid: window.__INITIAL_STATE__?.videoData?.cid,
    pages: data.data.pages,
    pageParam: resolvePageNumber(location.href),
    fallbackCid: data.data.cid,
  })

  return {
    aid: data.data.aid,
    cid,
    title: typeof data.data.title === 'string' ? data.data.title : '',
    description: typeof data.data.desc === 'string' ? data.data.desc : '',
    duration: resolveDuration(cid, data.data.pages, data.data.duration),
  }
}

/**
 * The runtime of the part on screen, in seconds.
 *
 * The part's own, not the collection's: a twelve-part upload reports one
 * `duration` for the whole thing, and using it would make every part look twelve
 * times longer than it is — which is the difference between a track being judged
 * complete and being judged an advert. The whole-video figure is the fallback
 * only, for the single-part case where the two are the same anyway.
 *
 * Seconds throughout on this endpoint, unlike the pgc one's milliseconds.
 */
export function resolveDuration(
  cid: number,
  pages: Array<{ cid?: number; duration?: number }> | undefined,
  fallback: unknown,
): number {
  const page = (pages ?? []).find((candidate) => candidate.cid === cid)
  return Number(page?.duration ?? fallback) || 0
}

/** One entry of a season, as the pgc API returns it. */
export interface SeasonEpisode {
  /** The episode id, without the `ep` prefix that the URL carries. */
  id: number
  aid: number
  cid: number
  /** Usually just the episode number, as a string. */
  title?: string
  /** The episode's own name, where it has one. */
  long_title?: string
  /** Milliseconds here, unlike the view endpoint's seconds. */
  duration?: number
}

export interface SeasonResult {
  title?: string
  /** The series synopsis. */
  evaluate?: string
  episodes?: SeasonEpisode[]
  /** Trailers, PVs and specials, grouped apart from the numbered episodes. */
  section?: Array<{ episodes?: SeasonEpisode[] }>
}

/**
 * Every episode of a season, numbered ones and extras alike.
 *
 * The extras are included because they are watchable pages like any other, and
 * a PV you opened has to resolve to something. Worth knowing when reading a
 * survey of subtitle coverage: an `ss` season of six episodes can report seven
 * entries, and the extra one is not an episode.
 */
export function episodesOf(result: SeasonResult): SeasonEpisode[] {
  return [
    ...(result.episodes ?? []),
    ...(result.section ?? []).flatMap((section) => section.episodes ?? []),
  ]
}

/**
 * Resolves a bangumi episode through the pgc API.
 *
 * A separate call from `fetchVideoInfo` because bangumi is a separate product:
 * episodes have no bvid, the view endpoint does not know them, and — verified
 * on `ep335910` — `window.__INITIAL_STATE__` is not defined on these pages at
 * all, so there is no page state to fall back on when the network says no.
 *
 * Season URLs resolve to nothing on purpose. `ss…` names a series, and which
 * episode it opens depends on how far you had got; guessing would file captures
 * and cache a transcript under the wrong episode, which is worse than waiting.
 * Bilibili settles the URL on an episode itself, and `watchVideoChange` picks
 * that up like any other change. Not quickly, though: measured on `ss20117` it
 * took upwards of twenty seconds, and it arrived as a full reload rather than a
 * history call, so the wait is a stretch of dead overlay and a warning in the
 * log that reads worse than it is.
 */
export async function fetchEpisodeInfo(videoId: VideoId): Promise<ResolvedVideo | null> {
  if (!videoId.startsWith('ep')) {
    console.log('[bb-subsgen] waiting for', videoId, 'to settle on an episode')
    return null
  }

  const resp = await fetch(
    `https://api.bilibili.com/pgc/view/web/season?ep_id=${videoId.slice(2)}`,
    { credentials: 'include' },
  )
  const data = await resp.json()
  if (data.code !== 0) {
    console.warn('[bb-subsgen] season API failed:', data.message)
    return null
  }

  const result = (data.result ?? {}) as SeasonResult
  const episode = episodesOf(result).find((candidate) => `ep${candidate.id}` === videoId)
  if (!episode) {
    console.warn('[bb-subsgen] no episode', videoId, 'in season', result.title)
    return null
  }

  return {
    videoId,
    aid: episode.aid,
    cid: episode.cid,
    // Both halves, because either alone is thin: the series name says what kind
    // of thing this is and the episode name says what this one is about, and the
    // preamble is trying to stop a model picking the wrong sense of a word.
    title: [result.title, episode.title, episode.long_title].filter(Boolean).join(' '),
    description: result.evaluate ?? '',
    duration: Number(episode.duration ?? 0) / 1000 || 0,
  }
}

/**
 * The video the id names, whichever product it belongs to.
 *
 * The one entry point worth calling: bangumi and ordinary videos are resolved
 * by different APIs returning different shapes, and nothing downstream has any
 * reason to know which of the two it is looking at.
 */
export async function resolveVideo(videoId: VideoId): Promise<ResolvedVideo | null> {
  if (isEpisodeId(videoId)) return fetchEpisodeInfo(videoId)

  const info = await fetchVideoInfo(videoId)
  return info ? { ...info, videoId } : null
}

export interface ResolveCidOptions {
  initialStateCid: number | undefined
  pages: Array<{ cid: number }> | undefined
  pageParam: number
  fallbackCid: number
}

export function resolveCid(opts: ResolveCidOptions): number {
  return opts.initialStateCid ?? opts.pages?.[opts.pageParam - 1]?.cid ?? opts.fallbackCid
}
