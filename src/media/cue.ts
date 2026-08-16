// A line of subtitle, and the one question worth asking about a set of them.
//
// Its own module because a cue is not Bilibili's idea. Every site this extension
// reads produces the same three fields, and the dozen modules that pass cues
// around — chunking, timing, the overlay, the caches — never needed to know
// which site a line came from. They used to import this type from
// `bilibili/subtitles`, which said otherwise.
//
// What is *not* here: the parsing. Turning a site's JSON into cues is that
// site's business, because the wire shapes have nothing in common — Bilibili
// answers with `from`/`to`/`content` in seconds or milliseconds depending on the
// endpoint, YouTube with `tStartMs`/`dDurationMs`/`segs[].utf8`. Each site
// normalizes its own; only the result is shared.

/** One line of subtitle, with its timings in seconds. */
export interface Cue {
  start: number
  end: number
  text: string
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
