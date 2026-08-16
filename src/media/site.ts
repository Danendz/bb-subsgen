// What the overlay needs to know about a video, and who it asks.
//
// The content script's job — find the lines, put them on screen, annotate them,
// keep the card clear of the controls — is the same everywhere. What differs is
// four questions: which video is this, what is it called, where are its
// subtitles, and where is its audio. A `Site` answers those four and nothing
// else, so `content/main.ts` can orchestrate without naming a site once.
//
// `resolve` hands back an object with methods rather than a record of fields,
// because the answers to the last two questions need things the first one found
// that nobody else should see. Bilibili's cues and audio both need an `aid` and
// a `cid`; YouTube's need a player response. Closing over them keeps those out
// of the shared shape without a generic parameter or a cast — the alternative
// designs both end with one site's private ids in a type everyone imports.

import type { AudioSource } from './audio-source'
import type { Cue } from './cue'
import type { PlayerChrome } from '../content/chrome'

/**
 * How sure a site is that a video is worth transcribing.
 *
 * A question only some sites have to ask. Every page the Bilibili adapter runs
 * on is Chinese, so it answers `certain` unconditionally and means it. YouTube
 * is mixed, and transcribing the wrong video there costs a download and minutes
 * of GPU — so it grades its evidence and the caller spends accordingly.
 *
 * - `certain`   — start at once.
 * - `likely`    — start once the video has actually been watched a while, so
 *                 clicking in and straight back out costs nothing.
 * - `uncertain` — ask, and do nothing until answered.
 * - `negative`  — do nothing, and show nothing.
 */
export type Confidence = 'certain' | 'likely' | 'uncertain' | 'negative'

export interface TranscribeVerdict {
  confidence: Confidence
  /**
   * What a remembered "yes" is filed under — a channel, a publisher, an
   * uploader. Empty where a site never needs to ask, which is also the value
   * that means "nothing to remember".
   */
  approvalKey: string
}

/** A video that exists, with the two expensive questions still unasked. */
export interface Video {
  /**
   * The canonical id, which is not always the one in the URL.
   *
   * Everything downstream files under this — captures, the transcript cache,
   * the LLM cache — so there is exactly one id per video however you arrived at
   * it. Namespaced per site where the raw ids could collide; see the YouTube
   * adapter, whose ids are prefixed for that reason.
   */
  videoId: string
  /** For the translator's system prompt, and for judging what language this is. */
  title: string
  description: string
  /** Whoever published it. Often the strongest signal of what language it is in. */
  author: string
  /** Runtime in seconds, or 0 where the site did not say. */
  duration: number
  /** Whether transcribing this is worth what it costs, and how sure the site is. */
  transcribe: TranscribeVerdict
  /**
   * The published subtitle track, or empty where there is none.
   *
   * Empty is not an error: most of bangumi is exactly this, and it is what makes
   * the caller reach for transcription instead.
   */
  fetchCues(): Promise<Cue[]>
  /**
   * Where this video's audio is, or null if it cannot be had.
   *
   * Called afresh every time rather than resolved once and kept: a media URL may
   * carry a deadline, and a stored one is a request that will eventually 403.
   */
  audioSource(): Promise<AudioSource | null>
}

export interface Site {
  /** For log lines, and for nothing that branches. */
  readonly name: string
  /** The video in a URL, or null where there isn't one. */
  parseVideoId(url: string): string | null
  resolve(videoId: string): Promise<Video | null>
  readonly chrome: PlayerChrome
}

/**
 * How often the URL is re-read, in milliseconds.
 *
 * Short enough that switching video feels like it just works, and cheap enough
 * not to care: the poll is a regex against a string.
 */
export const URL_POLL_MS = 300

/**
 * Both supported sites are SPAs and do not reload between videos. Calls
 * `onChange` whenever the video in the URL changes, so the caller can tear down
 * and rebuild the overlay for the new one.
 *
 * Null is a change like any other. Leaving a video for the homepage used to be
 * silent, on the reasoning that there was no new video to build — but the
 * teardown half of the callback still had to run, and skipping it left the
 * local model translating a video that was no longer on screen.
 *
 * Polls rather than wrapping `history.pushState`, which is what this did until
 * it was measured. A content script runs in an isolated world: it shares the
 * DOM with the page but not its globals, so the `history` it can wrap is its
 * own and never the one the site calls. Clicking episode 2 of a season changes
 * the URL without reloading the document, and the wrapper did not fire — the
 * overlay went on serving episode 1's cues over episode 2's audio. `location`
 * reads through to the real thing from either world, so asking is reliable
 * where being told is not. The same holds on YouTube, which navigates the same
 * way and fires its own events the isolated world cannot see either.
 *
 * `popstate` is a real event and does cross, so back and forward are still
 * reported the moment they happen rather than at the next poll.
 */
export function watchVideoChange(
  parseVideoId: (url: string) => string | null,
  onChange: (videoId: string | null) => void,
): () => void {
  let current = parseVideoId(location.href)

  const check = () => {
    const videoId = parseVideoId(location.href)
    if (videoId !== current) {
      current = videoId
      onChange(videoId)
    }
  }

  const polling = setInterval(check, URL_POLL_MS)
  window.addEventListener('popstate', check)

  return () => {
    clearInterval(polling)
    window.removeEventListener('popstate', check)
  }
}
