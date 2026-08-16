// Reading YouTube's own Chinese subtitles, when it will let us.
//
// Worth having because it is free: a video that already has Chinese captions
// needs no GPU at all, and the text is better than any transcription of it. It
// is last and least depended-upon because YouTube makes it awkward in a way the
// rest of this adapter is not.
//
// **The `baseUrl` in the player response does not work.** Fetched as given it
// answers `200` with an empty body — no error, no status, just nothing. It needs
// a proof-of-origin token (`pot`), minted by the player's own BotGuard code,
// which an extension cannot produce. Verified against a live page: the same
// request with the player's `pot` and `potc` appended returned 361 real cues.
//
// So the token is *borrowed*. When the player fetches its own subtitles the URL
// it used — token and all — lands in the document's Resource Timing entries,
// which a content script shares. If it is there, we can ask for any track we
// like. If it is not, there is nothing to be done and the caller transcribes
// instead, which on this site was the primary path anyway.

import type { Cue } from '../media/cue'
import { isChineseLanguage } from './language'
import type { CaptionTrack } from './player-response'

/**
 * The best Chinese track on offer, or null.
 *
 * Simplified over traditional where both exist, because the dictionary and the
 * segmenter are built around simplified — `useTraditional` converts for display,
 * so starting from simplified loses nothing and starting from traditional means
 * converting twice.
 *
 * A human track beats an auto-generated one for the same reason a published
 * Bilibili track beats a transcript: it is what somebody meant, not what a
 * machine heard. See `pickBestSubtitleTrack`, which ranks Bilibili's the same way.
 */
export function pickChineseTrack(tracks: CaptionTrack[]): CaptionTrack | null {
  const score = (track: CaptionTrack): number => {
    if (!isChineseLanguage(track.languageCode)) return -1
    const generated = track.kind === 'asr'
    const traditional = /hant|tw|hk|mo/i.test(track.languageCode)
    return (generated ? 0 : 100) + (traditional ? 5 : 10)
  }

  let best: CaptionTrack | null = null
  let bestScore = 0
  for (const track of tracks) {
    const value = score(track)
    if (value > bestScore) {
      bestScore = value
      best = track
    }
  }
  return best
}

/** One `events[]` entry of a json3 caption file. */
interface Json3Event {
  tStartMs?: unknown
  dDurationMs?: unknown
  segs?: Array<{ utf8?: unknown }>
  /** Set on the rolling-window duplicates an auto-generated track emits. */
  aAppend?: unknown
}

/**
 * Turns a json3 caption file into cues.
 *
 * Two things are dropped rather than rendered:
 *
 *   - **Events with no `segs`.** They carry window positioning and no text.
 *   - **Events flagged `aAppend`.** An auto-generated track is a rolling
 *     transcript: it re-sends the line so far with each new word, so keeping
 *     these would show every sentence several times over, growing.
 *
 * Newlines inside a segment become spaces. A cue is one line on screen here,
 * and the overlay lays it out itself.
 */
export function parseJson3(payload: unknown): Cue[] {
  const events = (payload as { events?: unknown })?.events
  if (!Array.isArray(events)) return []

  return (events as Json3Event[])
    .filter((event) => Array.isArray(event.segs) && event.aAppend !== 1)
    .map((event) => {
      const start = Number(event.tStartMs) / 1000
      const end = start + Number(event.dDurationMs) / 1000
      const text = (event.segs ?? [])
        .map((seg) => (typeof seg.utf8 === 'string' ? seg.utf8 : ''))
        .join('')
        .replace(/\s+/g, ' ')
        .trim()
      return { start, end, text }
    })
    .filter((cue) => cue.text.length > 0 && Number.isFinite(cue.start) && cue.end > cue.start)
    .sort((a, b) => a.start - b.start)
}

/**
 * The proof-of-origin token the player last used, if it has fetched subtitles.
 *
 * Read out of Resource Timing rather than intercepted, which needs no extra
 * permission and no second content script. Null is the ordinary case, not a
 * failure: the player only asks for subtitles once they are switched on, and the
 * isolated world cannot switch them on for it.
 */
export function borrowPoToken(
  entries: ReadonlyArray<{ name: string }>,
): { pot: string; potc: string } | null {
  for (let i = entries.length - 1; i >= 0; i--) {
    const name = entries[i].name
    if (!name.includes('/api/timedtext') || !name.includes('pot=')) continue
    try {
      const params = new URL(name).searchParams
      const pot = params.get('pot')
      if (pot) return { pot, potc: params.get('potc') ?? '1' }
    } catch {
      // A malformed entry is not worth a throw; keep looking.
    }
  }
  return null
}

/**
 * The URL to actually ask for, given a track and a borrowed token.
 *
 * `fmt=json3` because the default is XML and the JSON carries the per-segment
 * timings this needs. **No `tlang`, ever** — that parameter machine-translates a
 * track into another language, and asking for `tlang=zh-Hans` on an English
 * video would manufacture Chinese text that matches neither the audio nor
 * anything the publisher wrote. See `readPlayerResponse`, which declines to
 * parse the field that lists those languages for the same reason.
 */
export function captionUrl(track: CaptionTrack, token: { pot: string; potc: string }): string {
  const url = new URL(track.baseUrl)
  url.searchParams.set('fmt', 'json3')
  url.searchParams.set('pot', token.pot)
  url.searchParams.set('potc', token.potc)
  url.searchParams.set('c', 'WEB')
  return url.toString()
}

export interface FetchCaptionsOptions {
  tracks: CaptionTrack[]
  /** Defaults to the document's own Resource Timing entries. */
  entries?: ReadonlyArray<{ name: string }>
  fetchImpl?: typeof fetch
}

/**
 * YouTube's Chinese subtitles for this video, or empty.
 *
 * Empty covers every way this comes to nothing — no Chinese track, no borrowable
 * token, an empty body anyway — because the caller does the same thing for all
 * of them: transcribe instead.
 */
export async function fetchChineseCaptions({
  tracks,
  entries = typeof performance === 'undefined'
    ? []
    : (performance.getEntriesByType('resource') as ReadonlyArray<{ name: string }>),
  fetchImpl = fetch,
}: FetchCaptionsOptions): Promise<Cue[]> {
  const track = pickChineseTrack(tracks)
  if (!track) return []

  const token = borrowPoToken(entries)
  if (!token) {
    console.log(
      '[bb-subsgen] found a Chinese caption track but no proof-of-origin token —',
      'turn subtitles on once and reload to use it, or let it transcribe instead',
    )
    return []
  }

  try {
    const resp = await fetchImpl(captionUrl(track, token), { credentials: 'include' })
    const body = await resp.text()
    // The documented failure: 200, and nothing in it.
    if (!resp.ok || !body) return []
    const cues = parseJson3(JSON.parse(body))
    console.log(`[bb-subsgen] using YouTube's ${track.languageCode} track — ${cues.length} cues`)
    return cues
  } catch (e) {
    console.warn('[bb-subsgen] could not read the caption track', e)
    return []
  }
}
