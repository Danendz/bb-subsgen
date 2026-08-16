// What a video player looks like, as data rather than as code.
//
// Everything the overlay does to a player — position against its box, hide its
// own subtitles, step clear of its control bar, keep that bar awake while the
// pointer is on a word — is the same work on every site. Only the names differ.
// So the names are what varies, and `mount.ts` and `controls.ts` take them as a
// parameter instead of spelling one site's into their constants.
//
// The geometry maths does not appear here, because none of it turned out to be
// site-specific: `floorFor` measures the strip of container below the video,
// which is Bilibili's danmaku input bar and is simply zero on YouTube, where the
// player box and the video box coincide. Verified against a live page rather
// than assumed.

/** Whether Bilibili's control bar is currently showing.
 *
 * A missing attribute means we're on a player we don't recognize, so we resolve
 * to "don't lift" — degrading to the previous behavior rather than stranding
 * the card mid-screen. */
export function shouldLift(ctrlHidden: string | undefined): boolean {
  return ctrlHidden === 'false'
}

/**
 * Whether YouTube's control bar is currently showing.
 *
 * The inverse sense of Bilibili's, and a class rather than an attribute:
 * `ytp-autohide` is *added* when the bar goes away. Absent means showing, which
 * makes "a player we don't recognize" resolve to lifting rather than resting —
 * the opposite of `shouldLift`'s degradation. That is the right way round here:
 * on YouTube the container and the video are the same box, so an unnecessary
 * lift is a card sitting slightly high, where a missing one is a card sitting
 * under the scrubber.
 */
export function youtubeControlsShowing(className: string): boolean {
  // Split rather than matched. A regex `\bytp-autohide\b` looks right and is
  // not: `-` is a non-word character, so the trailing `\b` sits happily in the
  // middle of `ytp-autohide-active` and reads a different class as this one.
  return !className.split(/\s+/).includes('ytp-autohide')
}

export interface PlayerChrome {
  /** The box the overlay is positioned against, and which must contain the video. */
  containerSelector: string
  /** The player's own subtitles, hidden for as long as ours are up. */
  nativeSubtitleSelector: string
  /**
   * The element carrying the timeline scrubber.
   *
   * The scrubber and not the button row: on Bilibili `.bpx-player-control-bottom`
   * is the buttons alone and sits ~20px lower, which would leave the card
   * overlapping the very thing it is supposed to clear.
   */
  controlBarSelector: string
  /**
   * The player's own hover surface — whatever element's `mousemove` handler is
   * what shows the control bar. See `forwardHoverToPlayer`.
   */
  videoAreaSelector: string
  /** Whether the control bar is showing, and so whether the card must step up. */
  controlsShowing(container: HTMLElement): boolean
  /**
   * Attributes worth re-measuring on.
   *
   * Bilibili moves the geometry through two of them: `data-ctrl-hidden` when the
   * bar toggles, and `data-screen` on entering fullscreen — which changes the
   * container height and drops the danmaku bar, so the overlap has to be
   * recomputed even though the controls never moved. YouTube expresses both
   * through its class list.
   */
  geometryAttributes: string[]
}

export const BILIBILI_CHROME: PlayerChrome = {
  containerSelector: '.bpx-player-container',
  nativeSubtitleSelector: '.bpx-player-subtitle-wrap',
  controlBarSelector: '.bpx-player-control-wrap',
  // Its `mousemove` handler is what shows the control bar — `mouseover` and
  // `mouseenter` on it do nothing, and neither does `mousemove` on the container
  // above it (all verified against the live player).
  videoAreaSelector: '.bpx-player-video-area',
  controlsShowing: (container) => shouldLift(container.dataset.ctrlHidden),
  geometryAttributes: ['data-ctrl-hidden', 'data-screen'],
}

export const YOUTUBE_CHROME: PlayerChrome = {
  // `#movie_player` rather than `.html5-video-player`, which it also carries:
  // the id is the stable one, and it is `position: relative` and contains the
  // `<video>`, which is what the `inset: 0` shadow host needs.
  containerSelector: '#movie_player',
  nativeSubtitleSelector: '.ytp-caption-window-container',
  controlBarSelector: '.ytp-chrome-bottom',
  videoAreaSelector: '.html5-video-container',
  controlsShowing: (container) => youtubeControlsShowing(container.className),
  geometryAttributes: ['class'],
}
