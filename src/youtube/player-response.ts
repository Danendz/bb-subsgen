// Reading YouTube's player response out of the watch page.
//
// This is where a `__INITIAL_STATE__`-style page global would go, and cannot:
// a content script runs in an isolated world, so `window.ytInitialPlayerResponse`
// is the page's and never ours. (Bilibili's adapter has the same problem and
// solves it by asking an API instead; YouTube's equivalent needs an API key and
// a client version that themselves live in page globals, so the shortest honest
// route is to ask for the HTML again and read it.)
//
// Re-fetching the watch page sounds expensive and is not: it is roughly a
// megabyte against the ~9MB of audio a transcription pulls, it is same-origin so
// it carries the session, and it is the only request in this file.

/** One caption track, as the player response describes it. */
export interface CaptionTrack {
  /**
   * Where the cues are — but not usable as given.
   *
   * Verified against a live page: fetched as-is this answers `200` with an
   * *empty body*. It needs a proof-of-origin token appended, which only the
   * player can mint. See `youtube/captions.ts`.
   */
  baseUrl: string
  /** `zh-Hans`, `zh-Hant`, `en`, … */
  languageCode: string
  /**
   * `'asr'` for an auto-generated track, absent for a human one.
   *
   * The single most valuable field in this file. An auto-generated track is
   * transcribed *from the audio*, so its `languageCode` is a direct statement
   * about what language is being spoken — the one signal here that cannot be a
   * translation of something else.
   */
  kind?: string
  /** What the picker calls it, e.g. `Chinese (China) (auto-generated)`. */
  name: string
}

export interface PlayerResponse {
  videoId: string
  title: string
  description: string
  /** The channel name. Often a stronger language signal than the title. */
  author: string
  /** What a per-channel decision is remembered against. */
  channelId: string
  /** Runtime in seconds, or 0 when the page did not say. */
  lengthSeconds: number
  /** Live and upcoming streams have no whole-track audio to fetch. */
  isLive: boolean
  captionTracks: CaptionTrack[]
}

/**
 * The first balanced JSON object after `marker`.
 *
 * Brace-counted rather than matched with a regex. The obvious
 * `/ytInitialPlayerResponse\s*=\s*(\{.+?\});/s` is wrong in both directions: the
 * payload contains `};` inside string literals, and a greedy version runs to the
 * last `}` on the page. Counting depth while respecting strings and escapes is
 * the only version that survives a description containing a brace.
 */
export function extractJson(html: string, marker: string): unknown | null {
  const at = html.indexOf(marker)
  if (at < 0) return null
  const start = html.indexOf('{', at + marker.length)
  if (start < 0) return null

  let depth = 0
  let inString = false
  let escaped = false

  for (let i = start; i < html.length; i++) {
    const char = html[i]
    if (escaped) {
      escaped = false
      continue
    }
    if (inString) {
      if (char === '\\') escaped = true
      else if (char === '"') inString = false
      continue
    }
    if (char === '"') inString = true
    else if (char === '{') depth++
    else if (char === '}' && --depth === 0) {
      try {
        return JSON.parse(html.slice(start, i + 1))
      } catch {
        return null
      }
    }
  }
  return null
}

interface RawName {
  simpleText?: unknown
  runs?: Array<{ text?: unknown }>
}

function readName(name: RawName | undefined): string {
  if (typeof name?.simpleText === 'string') return name.simpleText
  const run = name?.runs?.[0]?.text
  return typeof run === 'string' ? run : ''
}

function readTracks(payload: unknown): CaptionTrack[] {
  const list = (
    payload as {
      captions?: { playerCaptionsTracklistRenderer?: { captionTracks?: unknown } }
    }
  )?.captions?.playerCaptionsTracklistRenderer?.captionTracks

  if (!Array.isArray(list)) return []
  return list
    .map((raw: Record<string, unknown>) => ({
      baseUrl: typeof raw.baseUrl === 'string' ? raw.baseUrl : '',
      languageCode: typeof raw.languageCode === 'string' ? raw.languageCode : '',
      ...(typeof raw.kind === 'string' ? { kind: raw.kind } : {}),
      name: readName(raw.name as RawName | undefined),
    }))
    .filter((track) => track.baseUrl && track.languageCode)
}

/**
 * The fields worth having out of a player response.
 *
 * Deliberately *not* `translationLanguages`, which sits right beside the tracks
 * and lists the 156 languages YouTube will machine-translate a track into. Those
 * are reachable by appending `&tlang=`, and doing so would manufacture a Chinese
 * "track" for an English video — text that matches neither the audio nor
 * anything the publisher wrote. For a tool that turns lines into flashcards that
 * is worse than having no subtitles at all, so the parser does not carry the
 * field that would make it possible.
 */
export function readPlayerResponse(payload: unknown): PlayerResponse | null {
  const details = (payload as { videoDetails?: Record<string, unknown> })?.videoDetails
  if (!details || typeof details.videoId !== 'string') return null

  return {
    videoId: details.videoId,
    title: typeof details.title === 'string' ? details.title : '',
    description: typeof details.shortDescription === 'string' ? details.shortDescription : '',
    author: typeof details.author === 'string' ? details.author : '',
    channelId: typeof details.channelId === 'string' ? details.channelId : '',
    lengthSeconds: Number(details.lengthSeconds) || 0,
    isLive: Boolean(details.isLive) || Boolean(details.isLiveContent),
    captionTracks: readTracks(payload),
  }
}

/** Where the marker sits in the HTML, as a `var` assignment in an inline script. */
const MARKER = 'ytInitialPlayerResponse'

/**
 * Fetches a watch page and reads its player response.
 *
 * Asks for the canonical watch URL rather than `location.href`, which on a real
 * visit carries a playlist, an index and a timestamp. Same page, one cache key,
 * and nothing in the response depends on the parts left off.
 */
export async function fetchPlayerResponse(
  videoId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<PlayerResponse | null> {
  try {
    const resp = await fetchImpl(`https://www.youtube.com/watch?v=${videoId}`, {
      credentials: 'include',
    })
    if (!resp.ok) {
      console.warn('[bb-subsgen] watch page failed for', videoId, resp.status)
      return null
    }
    const payload = extractJson(await resp.text(), MARKER)
    if (!payload) {
      console.warn('[bb-subsgen] no player response in the page for', videoId)
      return null
    }
    return readPlayerResponse(payload)
  } catch (e) {
    console.warn('[bb-subsgen] could not read the player response for', videoId, e)
    return null
  }
}
