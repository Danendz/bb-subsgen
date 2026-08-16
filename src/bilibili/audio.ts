// Getting at a video's audio, as a file rather than as playback.
//
// Bilibili serves DASH, which means the audio is a separate stream from the
// video and has its own plain URL. That is the fact this whole feature rests on:
// the audio for a fifty-minute episode is around 25MB and can be fetched in
// seconds, so the whole track can be transcribed *before* playback reaches it.
//
// Reading the burned-in subtitles instead would have had the opposite property.
// To see the pixels at ten minutes you must decode the video to ten minutes, so
// lines could only ever arrive behind the playhead — and the translation tier in
// content/tier.ts promotes the local model's work only once a run of cues *ahead*
// of the playhead exists, a gate that would then never open.

import { isEpisodeId, type VideoId } from './resolve'

/** One audio rendition, as the playurl API describes it. */
export interface AudioStream {
  /** Where the file actually is. Bilibili rotates these across several CDNs. */
  url: string
  /** Bits per second. */
  bandwidth: number
  codecs: string
}

export interface AudioTrack {
  stream: AudioStream
  /** Whole-video duration in seconds. */
  duration: number
}

/**
 * The playurl endpoint for a video, whichever product it belongs to.
 *
 * `fnval=4048` asks for DASH. Without it the API answers with the legacy
 * single-file format, where audio and video are muxed together and there is no
 * separate audio stream to fetch.
 */
export function playurlUrl(videoId: VideoId, cid: number): string {
  const query = new URLSearchParams({ cid: String(cid), fnval: '4048', fourk: '1' })

  if (isEpisodeId(videoId)) {
    query.set('ep_id', videoId.replace(/^\D+/, ''))
    return `https://api.bilibili.com/pgc/player/web/playurl?${query}`
  }

  query.set('bvid', videoId)
  return `https://api.bilibili.com/x/player/playurl?${query}`
}

interface RawStream {
  baseUrl?: unknown
  base_url?: unknown
  bandwidth?: unknown
  codecs?: unknown
}

/**
 * The cheapest usable rendition.
 *
 * Deliberately the *lowest* bitrate on offer. Everything downstream resamples to
 * mono 16kHz before the audio reaches a model — that is simply what speech
 * recognition takes — so a 320kbps stream is discarded down to the same thing a
 * 66kbps one is, having cost five times the bytes to fetch.
 */
export function pickAudioStream(streams: unknown): AudioStream | null {
  if (!Array.isArray(streams)) return null

  const usable = (streams as RawStream[])
    .map((raw) => {
      const url = raw.baseUrl ?? raw.base_url
      if (typeof url !== 'string' || !url) return null
      return {
        url,
        bandwidth: typeof raw.bandwidth === 'number' ? raw.bandwidth : Infinity,
        codecs: typeof raw.codecs === 'string' ? raw.codecs : '',
      }
    })
    .filter((stream): stream is AudioStream => stream !== null)

  if (!usable.length) return null
  return usable.reduce((best, stream) => (stream.bandwidth < best.bandwidth ? stream : best))
}

/**
 * Both shapes the playurl API answers in.
 *
 * Bangumi replies under `result`, ordinary videos under `data`, and the contents
 * are otherwise the same. Neither is a fallback for the other — they are two
 * endpoints — so this reads whichever is present rather than preferring one.
 */
export function readPlayurl(payload: {
  code?: number
  result?: unknown
  data?: unknown
}): AudioTrack | null {
  if (payload.code !== 0) return null

  const body = (payload.result ?? payload.data) as
    | { dash?: { audio?: unknown }; timelength?: unknown }
    | undefined
  if (!body) return null

  const stream = pickAudioStream(body.dash?.audio)
  if (!stream) return null

  // Milliseconds on the wire; seconds everywhere in this codebase.
  const timelength = typeof body.timelength === 'number' ? body.timelength : 0
  return { stream, duration: timelength / 1000 }
}

export interface FetchAudioTrackOptions {
  videoId: VideoId
  cid: number
  signal?: AbortSignal
  fetchImpl?: typeof fetch
}

/**
 * Where this video's audio is, and how long it runs.
 *
 * Null covers every way this can come to nothing — a video served in the legacy
 * muxed format, a region lock, an episode that will not play — because the
 * caller's response to all of them is the same: leave the page alone.
 */
export async function fetchAudioTrack({
  videoId,
  cid,
  signal,
  fetchImpl = fetch,
}: FetchAudioTrackOptions): Promise<AudioTrack | null> {
  try {
    const resp = await fetchImpl(playurlUrl(videoId, cid), {
      credentials: 'include',
      ...(signal ? { signal } : {}),
    })
    const track = readPlayurl(await resp.json())
    if (!track) console.warn('[bb-subsgen] no DASH audio for', videoId)
    return track
  } catch (e) {
    console.warn('[bb-subsgen] playurl failed for', videoId, e)
    return null
  }
}
