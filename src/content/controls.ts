// Keeps the subtitle card clear of the player's auto-hiding control bar.
//
// The trigger is the player's own signal that its bar is up — Bilibili's
// `data-ctrl-hidden` attribute, YouTube's `ytp-autohide` class — rather than our
// own hover tracking: each already accounts for the idle auto-hide, for the bar
// staying up while a settings menu is open, and for fullscreen, none of which a
// hand-rolled pointer timer gets right. Which signal to read is `PlayerChrome`'s
// business; this module only asks.

import type { PlayerChrome } from './chrome'

/** Just the parts of a DOMRect this module needs, so tests can pass plain objects. */
export interface RectLike {
  top: number
  bottom: number
}

/** Breathing room between the card and the top of the control bar. */
const GAP = 8

/**
 * How far above the container's bottom edge the card must sit to clear the bar.
 *
 * Deliberately measures the bar's *overlap* with the container rather than the
 * bar's own height. In normal mode the container is taller than the video — the
 * danmaku input bar occupies the bottom ~56px — and the overlap already accounts
 * for that offset, where a raw height would under-lift by exactly that much.
 */
export function liftFor(container: RectLike, control: RectLike, gap: number): number {
  const overlap = container.bottom - control.top
  if (overlap <= 0) return 0
  // A bar reported as taller than the player would otherwise push the card off
  // the top of the video.
  return Math.min(overlap + gap, container.bottom - container.top)
}

/**
 * The strip of container below the video that the card must never enter.
 *
 * In normal mode the player container is taller than the video: the danmaku
 * input row sits underneath it and is still inside the container the overlay is
 * positioned against, so a resting position of 0% would land the subtitle on
 * the comment box rather than on the video. Zero in fullscreen.
 */
export function floorFor(container: RectLike, video: RectLike): number {
  return Math.max(0, container.bottom - video.bottom)
}

/** How much of the container's bottom edge the card must stay clear of. */
export interface PlayerGeometry {
  /** Non-video chrome below the video — unconditional, it is not a preference. */
  floor: number
  /** Extra clearance while the control bar is showing. Zero when it is hidden. */
  lift: number
}

/**
 * How long after the pointer leaves the overlay before the card may move again.
 *
 * Must stay ≥ hover.ts's RESUME_GRACE_MS (asserted by a test): the popup lingers
 * for that long after the pointer leaves and is positioned against the shadow
 * host rather than the card, so moving the card inside that window tears the two
 * apart on screen. The delay also absorbs the few milliseconds Bilibili takes to
 * notice the pointer is back over the video, which would otherwise read as
 * "controls hidden" and drop the card for one frame.
 */
export const HOVER_SETTLE_MS = 400

export interface GeometryGate {
  /** Re-measure, and emit if anything changed and the card is free to move. */
  update: () => void
  stop: () => void
}

/**
 * Gates geometry changes on the pointer not being over the overlay.
 *
 * Without this the lift is a feedback loop. Showing the controls raises the
 * card *into* the pointer; `.word` has `pointer-events: auto`, so the video
 * receives mouseleave; Bilibili hides the controls; the card drops back out
 * from under the pointer; the video receives mouseenter — about ten times a
 * second, which is the "jumping" this fixes.
 */
export function createGeometryGate({
  measure,
  onChange,
  hoverTarget,
  settleMs = HOVER_SETTLE_MS,
}: {
  measure: () => PlayerGeometry
  onChange: (geometry: PlayerGeometry) => void
  /** The shadow host. Being `pointer-events: none` itself, it only sees these
   *  events when an interactive descendant (`.word`, `.popup`) is under the
   *  pointer — which is exactly the condition we need. */
  hoverTarget: EventTarget
  settleMs?: number
}): GeometryGate {
  let last: PlayerGeometry | null = null
  let held = false
  let settle: ReturnType<typeof setTimeout> | null = null

  const clearSettle = () => {
    if (settle) clearTimeout(settle)
    settle = null
  }

  const update = () => {
    if (held) return
    const next = measure()
    if (last && next.floor === last.floor && next.lift === last.lift) return
    last = next
    onChange(next)
  }

  const hold = () => {
    clearSettle()
    held = true
  }

  const release = () => {
    clearSettle()
    settle = setTimeout(() => {
      settle = null
      held = false
      update()
    }, settleMs)
  }

  hoverTarget.addEventListener('pointerenter', hold)
  hoverTarget.addEventListener('pointerleave', release)

  return {
    update,
    stop() {
      clearSettle()
      hoverTarget.removeEventListener('pointerenter', hold)
      hoverTarget.removeEventListener('pointerleave', release)
    },
  }
}

/** The player resets its own idle timer on every move; matching it
 *  move-for-move is wasted work. */
const FORWARD_INTERVAL_MS = 100

/**
 * Keeps Bilibili's control bar awake while the pointer is on our overlay.
 *
 * `.word` and `.popup` are `pointer-events: auto`, so hovering a character
 * takes the pointer off the video as far as the player is concerned and its
 * control bar hides — which reads as the timeline flickering away whenever you
 * inspect a word. Replaying the movement onto the video area makes hovering a
 * character behave like hovering the video underneath it, including hiding the
 * bar again once you hold still.
 */
export function forwardHoverToPlayer(
  container: HTMLElement,
  overlayHost: EventTarget,
  chrome: PlayerChrome,
): () => void {
  let lastForwardedAt = 0

  const onMove = (event: Event) => {
    const move = event as MouseEvent
    // timeStamp rather than a clock read: monotonic, and already on the event.
    if (move.timeStamp - lastForwardedAt < FORWARD_INTERVAL_MS) return
    lastForwardedAt = move.timeStamp

    const area =
      container.querySelector(chrome.videoAreaSelector) ?? container.querySelector('video')
    // Dispatched outside our shadow host, so this cannot re-enter this handler.
    area?.dispatchEvent(
      new MouseEvent('mousemove', {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: move.clientX,
        clientY: move.clientY,
      }),
    )
  }

  overlayHost.addEventListener('mousemove', onMove)
  return () => overlayHost.removeEventListener('mousemove', onMove)
}

/**
 * Reports the player's bottom geometry, re-measuring whenever the controls
 * toggle, the screen mode changes, or the player is resized.
 *
 * Both numbers come from the same two observers, so they are measured together
 * rather than by two overlapping watchers.
 */
export function watchControls(
  container: HTMLElement,
  video: HTMLElement,
  overlayHost: EventTarget,
  chrome: PlayerChrome,
  onChange: (geometry: PlayerGeometry) => void,
): () => void {
  const gate = createGeometryGate({
    hoverTarget: overlayHost,
    onChange,
    measure: () => {
      const containerRect = container.getBoundingClientRect()
      const floor = floorFor(containerRect, video.getBoundingClientRect())

      if (!chrome.controlsShowing(container)) return { floor, lift: 0 }
      const bar = container.querySelector(chrome.controlBarSelector)
      if (!bar) return { floor, lift: 0 }
      return { floor, lift: liftFor(containerRect, bar.getBoundingClientRect(), GAP) }
    },
  })

  // More than the controls-toggle signal: entering fullscreen changes the
  // container height and drops the danmaku bar, so the overlap has to be
  // recomputed even though the controls never toggled. See `geometryAttributes`.
  const attributes = new MutationObserver(gate.update)
  attributes.observe(container, {
    attributes: true,
    attributeFilter: chrome.geometryAttributes,
  })

  const resize = new ResizeObserver(gate.update)
  resize.observe(container)
  // The video can resize without the container doing so — switching to a
  // differently-shaped source changes the floor but not the player box.
  resize.observe(video)

  gate.update()

  return () => {
    attributes.disconnect()
    resize.disconnect()
    gate.stop()
  }
}
