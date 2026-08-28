// Downloading a video's audio, which only the page may do.
//
// Separate from `audio-source.ts`, which names *where* the audio is: this is the
// one step of a transcription that is pinned to a particular origin, and it is
// pinned there by a CDN rather than by anything a site adapter decides.

/** What came back from the CDN, or why nothing did. */
export type AudioBytes = { bytes: Uint8Array } | { error: string }

/**
 * Downloads an audio stream, and must be called from a content script.
 *
 * Where this runs is the whole point of it. Bilibili's media CDN answers 403
 * unless the request carries `Referer: https://www.bilibili.com/` — verified
 * against a live URL, where a browser User-Agent alone still gets a 403 and an
 * `Origin` header does not substitute — and Chrome attaches no referrer to a
 * request made from an extension page. The offscreen document could therefore
 * name the audio, plan the work and report progress, and then fail on the one
 * request that mattered. A content script's fetch is attributed to the page and
 * carries `https://www.bilibili.com/` as its referrer under the default policy,
 * which is exactly what the CDN is checking for.
 *
 * Site-neutral despite that reasoning, and here rather than in `src/bilibili/`
 * for exactly that: it is handed a URL and never asks who resolved it. The
 * overlay is the only caller, and naming a site there would be a Bilibili
 * assumption in the one module that runs on every site.
 */
export async function fetchAudioBytes(
  url: string,
  { signal, fetchImpl = fetch }: { signal?: AbortSignal; fetchImpl?: typeof fetch } = {},
): Promise<AudioBytes> {
  // The URL comes from our own offscreen document rather than from the page, but
  // this is still a content script fetching whatever it is handed, so the scheme
  // is checked rather than assumed.
  if (!url.startsWith('https://')) return { error: 'The audio is not served over https.' }

  try {
    const resp = await fetchImpl(url, { credentials: 'omit', ...(signal ? { signal } : {}) })
    if (!resp.ok) return { error: `Could not fetch the audio: ${resp.status}` }
    return { bytes: new Uint8Array(await resp.arrayBuffer()) }
  } catch (e) {
    return { error: `Could not fetch the audio: ${e instanceof Error ? e.message : String(e)}` }
  }
}
