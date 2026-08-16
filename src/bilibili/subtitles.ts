import { isEpisodeId } from './resolve'

export interface SubtitleTrack {
  lan: string
  lan_doc: string
  subtitle_url: string
}

export interface RawCue {
  from?: number
  to?: number
  start_time?: number
  end_time?: number
  content?: string
  text?: string
}

export interface Cue {
  start: number
  end: number
  text: string
}

function scoreTrack(track: SubtitleTrack): number {
  if (!track.subtitle_url) return -1
  const lan = track.lan.toLowerCase()
  const doc = track.lan_doc ?? ''
  if (lan === 'zh-hans' || lan === 'zh-cn') return 120
  if (lan === 'zh' || lan.startsWith('zh-')) return 110
  if (lan === 'ai-zh') return 100
  if (doc.includes('中文')) return 105
  return -1
}

export function pickBestSubtitleTrack(tracks: SubtitleTrack[]): SubtitleTrack | null {
  let best: SubtitleTrack | null = null
  let bestScore = -1
  for (const track of tracks) {
    const score = scoreTrack(track)
    if (score > bestScore) {
      bestScore = score
      best = track
    }
  }
  return bestScore >= 0 ? best : null
}

export function normalizeCue(raw: RawCue): Cue | null {
  const fromRaw = raw.from ?? raw.start_time ?? 0
  const toRaw = raw.to ?? raw.end_time ?? 0
  const asMs = fromRaw > 100_000 || toRaw > 100_000
  const start = asMs ? fromRaw / 1000 : fromRaw
  const end = asMs ? toRaw / 1000 : toRaw
  const text = raw.content ?? raw.text ?? ''
  if (!(end > start) || text.length === 0) return null
  return { start, end, text }
}

/**
 * The floor a real track clears easily and an advert cannot.
 *
 * Continuous Mandarin speech runs somewhere around 10-25 subtitle lines a
 * minute, so one line a minute is an order of magnitude below anything genuine
 * — the threshold is deliberately nowhere near the boundary, because being
 * wrong in the strict direction throws away a publisher's own text.
 */
export const MIN_CUES_PER_MINUTE = 1

/**
 * Whether a track is a transcript of the video, or an advert wearing one.
 *
 * Bilibili serves some bangumi episodes a "subtitle track" holding a single cue
 * of promotional text — `↓↓敲重点↓↓…保存头像用微信扫呀` on ep335910, a fifty-minute
 * documentary. It is a valid track by every structural test: right language,
 * real URL, well-formed timings. Only its density gives it away.
 *
 * This matters beyond the eyesore. That one cue is enough to make the video look
 * captioned, which suppresses transcription entirely — so the episode is not
 * merely showing the wrong line, it is showing the wrong line *instead of* the
 * ones ASR would have produced.
 *
 * Unknown duration answers true. Not knowing how long the video is, is not
 * evidence against the track.
 */
export function looksLikeTranscript(cues: Cue[], durationSeconds: number): boolean {
  if (cues.length === 0) return false
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return true
  return cues.length >= (durationSeconds / 60) * MIN_CUES_PER_MINUTE
}

export interface SubtitleFetchParams {
  aid: number
  cid: number
  /**
   * The video, in whichever spelling it has.
   *
   * Turned below into the parameter the endpoint actually expects — `bvid` for
   * an ordinary video, `ep_id` for a bangumi episode. Keeping that here means it
   * is decided once, rather than at every call site that happens to know which
   * kind of page it is on.
   */
  videoId: string
}

/** The query string for the player endpoints, named the way each product wants. */
export function trackQuery({ aid, cid, videoId }: SubtitleFetchParams): string {
  const query = new URLSearchParams({ aid: String(aid), cid: String(cid) })
  if (isEpisodeId(videoId)) query.set('ep_id', videoId.replace(/^\D+/, ''))
  else query.set('bvid', videoId)
  return query.toString()
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchTrackList(
  params: SubtitleFetchParams,
  initialStateTracks?: SubtitleTrack[],
): Promise<SubtitleTrack[] | null> {
  const query = trackQuery(params)
  const endpoints = [
    `https://api.bilibili.com/x/player/wbi/v2?${query}`,
    `https://api.bilibili.com/x/player/v2?${query}`,
  ]
  for (const url of endpoints) {
    try {
      const resp = await fetch(url, { credentials: 'include' })
      const data = await resp.json()
      if (data.code === 0 && data.data?.subtitle?.subtitles?.length) {
        return data.data.subtitle.subtitles
      }
      console.log('[bb-subsgen] no tracks from', url, '- code:', data.code)
    } catch (e) {
      console.warn('[bb-subsgen] track fetch failed for', url, e)
    }
  }
  // Embedded tracks often carry an empty subtitle_url, so this rarely yields
  // a usable track — it's a last resort, not a substitute for the API call.
  return initialStateTracks?.length ? initialStateTracks : null
}

async function fetchCueFile(subtitleUrl: string): Promise<Cue[] | null> {
  const url = subtitleUrl.startsWith('//') ? `https:${subtitleUrl}` : subtitleUrl
  const resp = await fetch(url)
  const data = await resp.json()
  const cues: Cue[] = (data.body ?? [])
    .map(normalizeCue)
    .filter((cue: Cue | null): cue is Cue => cue !== null)
    .sort((a: Cue, b: Cue) => a.start - b.start)
  return cues.length ? cues : null
}

export async function fetchSubtitles(
  params: SubtitleFetchParams,
  initialStateTracks?: SubtitleTrack[],
): Promise<Cue[] | null> {
  // Bilibili intermittently returns an empty subtitle list; retry briefly.
  const maxAttempts = 3
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const tracks = await fetchTrackList(params, initialStateTracks)
    const best = tracks ? pickBestSubtitleTrack(tracks) : null
    if (best) {
      console.log('[bb-subsgen] using track', best.lan, best.lan_doc)
      try {
        const cues = await fetchCueFile(best.subtitle_url)
        if (cues) {
          // Enough to recognise a junk track on sight. A count, the stretch it
          // covers and the first line say in one glance whether this is the
          // episode's dialogue or an advert with a timestamp on it.
          console.log(
            `[bb-subsgen] track has ${cues.length} cue${cues.length === 1 ? '' : 's'},`,
            `${Math.round(cues[0].start)}s-${Math.round(cues[cues.length - 1].end)}s,`,
            `first: ${JSON.stringify(cues[0].text.slice(0, 60))}`,
          )
          return cues
        }
        console.warn('[bb-subsgen] track had no usable cues')
      } catch (e) {
        console.warn('[bb-subsgen] cue file fetch failed', e)
      }
    } else if (tracks?.length) {
      console.log(
        '[bb-subsgen] no usable track among:',
        tracks.map((t) => `${t.lan}(url=${Boolean(t.subtitle_url)})`).join(', '),
      )
    }
    if (attempt < maxAttempts) await sleep(400 * attempt)
  }
  return null
}
