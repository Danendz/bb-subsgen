// Keeping exactly one offscreen document alive, from a worker that keeps forgetting.
//
// Two awkward facts meet here. Only one offscreen document may exist per
// extension, and `createDocument` rejects rather than no-ops when one already
// does — while the worker itself is torn down whenever Chrome decides it has
// been idle, losing any flag it was using to remember. So existence is asked of
// the runtime rather than tracked, and the create is guarded against being
// entered twice concurrently.
//
// A third, which cost more to find than either: the document's own lifetime
// depends on the reason it was created for. See the note on `reasons` below.

const OFFSCREEN_PATH = 'src/offscreen/index.html'

/** In flight, so two callers arriving together do not both try to create one. */
let creating: Promise<unknown> | null = null

async function exists(): Promise<boolean> {
  const contexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] })
  return contexts.length > 0
}

/** Ensures the document is there, whoever asks and however often. */
export async function ensureOffscreen(): Promise<void> {
  if (await exists()) return

  if (!creating) {
    creating = chrome.offscreen
      .createDocument({
        url: OFFSCREEN_PATH,
        // Not AUDIO_PLAYBACK, despite this being about audio. That reason is the
        // one reason Chrome attaches a lifetime to: it "sets the document to
        // close after 30 seconds without audio playing", and this document never
        // plays anything — it decodes. Chrome would shut it down half a minute
        // in, killing the download, the decode or the request in flight, which
        // the speech server sees as the client hanging up mid-transcription.
        //
        // BLOBS is the honest fit for what it actually does — turn fetched bytes
        // into a WAV blob per chunk — and, like every reason other than
        // AUDIO_PLAYBACK, carries no lifetime limit. It stays until closed.
        reasons: ['BLOBS' as chrome.offscreen.Reason],
        justification: 'Decoding video audio into WAV chunks so it can be transcribed locally.',
      })
      .finally(() => {
        creating = null
      })
  }

  try {
    await creating
  } catch (e) {
    // Losing the race is the expected way this fails, and the document the
    // winner created is the one this caller wanted anyway.
    if (!(await exists())) throw e
  }
}

/**
 * Closes it, releasing the decoded audio it may still be holding.
 *
 * Worth doing rather than leaving it resident: a decoded track is the largest
 * allocation this extension ever makes, and the document has nothing else to do
 * between videos.
 */
export async function closeOffscreen(): Promise<void> {
  if (!(await exists())) return
  try {
    await chrome.offscreen.closeDocument()
  } catch {
    // Already gone, which is the state that was wanted.
  }
}
