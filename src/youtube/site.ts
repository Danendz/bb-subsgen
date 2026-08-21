// YouTube, as the overlay sees it.
//
// The shape is the same as Bilibili's adapter; almost everything inside it is
// not. Three differences are worth knowing before reading:
//
//   1. Ids are prefixed `yt:`. YouTube ids are eleven characters of
//      `[A-Za-z0-9_-]`, so `ep1234ABCDE` is a perfectly legal one — and
//      `isEpisodeId` would read that as a bangumi episode. The prefix keeps the
//      two id spaces from ever meeting in a cache key. Bilibili's stay bare so
//      that nothing already stored has to be migrated.
//
//   2. There is no metadata API. The player response is read out of the watch
//      page HTML, because a content script cannot see the page's globals.
//
//   3. The audio does not come from YouTube. It comes from a local helper, for
//      the reason given on `Settings.ytdlpBaseUrl`.

import { YOUTUBE_CHROME } from '../content/chrome'
import type { AudioSource } from '../media/audio-source'
import type { Site, Video } from '../media/site'
import { loadSettings } from '../shared/settings'
import { fetchChineseCaptions } from './captions'
import { confidenceOf } from './language'
import { fetchPlayerResponse, type PlayerResponse } from './player-response'

/** The `yt:` namespace, so an id can never be mistaken for Bilibili's. */
export const YOUTUBE_PREFIX = 'yt:'

export function isYoutubeId(videoId: string): boolean {
  return videoId.startsWith(YOUTUBE_PREFIX)
}

/** The bare eleven-character id, for talking to YouTube and to the helper. */
export function bareId(videoId: string): string {
  return videoId.startsWith(YOUTUBE_PREFIX) ? videoId.slice(YOUTUBE_PREFIX.length) : videoId
}

/**
 * The video in a watch URL, or null.
 *
 * Only `/watch`. Shorts are too short to be worth minutes of transcription,
 * live streams have no finished audio track to fetch at all, and an embed has no
 * page chrome to hang an overlay on — each would need its own handling rather
 * than the same handling, so none of them is quietly accepted here.
 */
export function parseVideoId(url: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  if (parsed.pathname !== '/watch') return null

  const id = parsed.searchParams.get('v')
  return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? `${YOUTUBE_PREFIX}${id}` : null
}

/**
 * Tidies a typed helper address.
 *
 * Deliberately **not** `normalizeBaseUrl`, which appends `/v1` to a bare host.
 * That is the OpenAI convention, right for the chat and speech servers whose
 * settings this one sits beside, and meaningless here: the helper serves
 * `/audio` and `/health` and has nothing under `/v1`. Sharing the normaliser is
 * what made `localhost:8770` become `localhost:8770/v1` and every request 404.
 *
 * A `/v1` suffix is stripped rather than rejected, because the only way to have
 * one is to have been handed it by that shared normaliser — so an address saved
 * before this existed starts working again without being retyped.
 */
export function normalizeHelperUrl(input: string): string {
  const trimmed = input.trim().replace(/\/+$/, '')
  if (!trimmed) return ''

  // Any scheme counts as present; testing only for http(s) would turn
  // `ftp://host` into `http://ftp://host`. Same reasoning as `normalizeBaseUrl`.
  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
  const withScheme = hasScheme ? trimmed : `http://${trimmed}`

  try {
    const url = new URL(withScheme)
    const path = url.pathname.replace(/\/+$/, '').replace(/\/v1$/, '')
    return `${url.origin}${path}`
  } catch {
    return trimmed
  }
}

/**
 * Where the helper will serve this video's audio.
 *
 * `via: 'direct'` because the helper is on localhost, which the offscreen
 * document can reach and a content script cannot — the mirror image of
 * Bilibili's CDN, and the reason `AudioSource` names a fetcher at all.
 *
 * Normalised here as well as in the settings field, so a value stored before
 * `normalizeHelperUrl` existed is corrected at the point of use rather than
 * only for anyone who retypes it.
 */
export function helperAudioUrl(baseUrl: string, videoId: string): string {
  return `${normalizeHelperUrl(baseUrl)}/audio?v=${encodeURIComponent(bareId(videoId))}`
}

async function audioSourceFor(
  response: PlayerResponse,
  videoId: string,
): Promise<AudioSource | null> {
  if (response.isLive) {
    console.log('[bb-subsgen] live stream — there is no finished audio track to transcribe')
    return null
  }

  const { ytdlpBaseUrl } = await loadSettings()
  if (!ytdlpBaseUrl) {
    console.log('[bb-subsgen] no audio helper configured (Settings → Speech to text)')
    return null
  }

  return {
    url: helperAudioUrl(ytdlpBaseUrl, videoId),
    // From the page rather than from the helper, so the chunk plan and the first
    // progress report land before the download starts — the same ordering
    // `offscreen/main.ts` documents for Bilibili.
    durationSeconds: response.lengthSeconds,
    via: 'direct',
  }
}

export const youtubeSite: Site = {
  name: 'youtube',
  chrome: YOUTUBE_CHROME,
  parseVideoId,

  async resolve(videoId): Promise<Video | null> {
    const response = await fetchPlayerResponse(bareId(videoId))
    if (!response) return null

    console.log('[bb-subsgen] resolved', videoId, {
      title: response.title,
      author: response.author,
      lengthSeconds: response.lengthSeconds,
      tracks: response.captionTracks.map((t) => `${t.languageCode}${t.kind ? `(${t.kind})` : ''}`),
    })

    return {
      videoId,
      title: response.title,
      description: response.description,
      author: response.author,
      duration: response.lengthSeconds,
      transcribe: {
        confidence: response.isLive ? 'negative' : confidenceOf(response),
        approvalKey: response.channelId,
      },
      // Empty whenever YouTube will not hand its subtitles over, which is often
      // — see `fetchChineseCaptions`. That is the right answer rather than a
      // failure: it sends the caller down the transcription path, which on this
      // site is the primary one anyway.
      fetchCues: () => fetchChineseCaptions({ tracks: response.captionTracks }),
      audioSource: () => audioSourceFor(response, videoId),
    }
  },
}
