// Bilibili, as the overlay sees it.
//
// Nothing new: the four questions in `Site` were already answered by the modules
// beside this one, and this binds them together so that `content/main.ts` can
// ask them without knowing which site it is on. `aid` and `cid` never leave here
// — they are closed over by the video `resolve` hands back, which is the whole
// reason that shape has methods rather than fields.

import type { Site, Video } from '../media/site'
import { BILIBILI_CHROME } from '../content/chrome'
import { resolveAudioSource } from './audio'
import { parseVideoIdFromUrl, resolveVideo } from './resolve'
import { fetchSubtitles } from './subtitles'

export const bilibiliSite: Site = {
  name: 'bilibili',
  chrome: BILIBILI_CHROME,
  parseVideoId: parseVideoIdFromUrl,

  async resolve(videoId): Promise<Video | null> {
    const info = await resolveVideo(videoId)
    if (!info) {
      console.warn('[bb-subsgen] could not resolve aid/cid for', videoId)
      return null
    }
    console.log('[bb-subsgen] resolved', info.videoId, info)

    return {
      // The resolver's id, not the one asked for: a season URL settles on an
      // episode, and that episode is what every capture has to be filed under.
      videoId: info.videoId,
      title: info.title,
      description: info.description,
      // Bilibili's APIs do not name the uploader on either of the endpoints this
      // already calls, and it is wanted only to guess whether a video is Chinese
      // — a question that does not arise here, where every page is.
      author: '',
      duration: info.duration,
      // Unconditional, and honest rather than lazy: every page this adapter is
      // injected on is a Chinese-language video, so there is nothing to weigh
      // and nobody to ask.
      transcribe: { confidence: 'certain', approvalKey: '' },

      fetchCues: () =>
        fetchSubtitles(
          { aid: info.aid, cid: info.cid, videoId: info.videoId },
          // A page-world global, so an isolated content script reads undefined
          // here in practice; `fetchSubtitles` documents it as a last resort
          // behind two real API calls, and it is kept for the day one of those
          // is unavailable rather than for the value it currently supplies.
          window.__INITIAL_STATE__?.videoData?.subtitle?.list,
        ).then((cues) => cues ?? []),

      audioSource: () => resolveAudioSource({ videoId: info.videoId, cid: info.cid }),
    }
  },
}
