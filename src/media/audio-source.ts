// Where a video's audio is, and who is allowed to go and get it.
//
// This exists because the answer to the second question is not the same on every
// site, and the offscreen document — which decodes and transcribes — is the one
// context that must not have to care.
//
// It used to. `offscreen/main.ts` resolved Bilibili's audio itself, which meant
// threading Bilibili's `cid` through the content script, the worker and the
// message protocol so that the offscreen document could make a Bilibili API call
// at the end of it. Any second site would have had to add its own field beside
// `cid` and its own branch at the point of use. Resolving where the knowledge is
// — in the page, which knows what site it is on — and sending the *result* keeps
// that knowledge in one place.

/**
 * Who fetches the bytes.
 *
 * Not a preference. Bilibili's media CDN answers 403 unless the request carries
 * a bilibili referrer, and Chrome attaches none to a request made from an
 * extension page — so those bytes can only come through a content script. A
 * localhost helper is the mirror image: reachable from the extension origin, and
 * blocked outright for a public page. See the headers of `bilibili/audio.ts` and
 * `llm/client.ts` for the two halves of that split.
 */
export type AudioFetcher = 'page' | 'direct'

export interface AudioSource {
  /** Where the audio is. */
  url: string
  /**
   * Whole-track runtime in seconds, or 0 when unknown.
   *
   * Carried rather than measured because the chunk plan is cut from it, and the
   * plan is reported before the download starts — so this has to be known
   * without having the audio in hand.
   */
  durationSeconds: number
  via: AudioFetcher
}
