// "The deck changed" — said once, heard by every screen reading it.
//
// The aside is mounted by `Shell.tsx` and never unmounts: routes swap what is
// in `main`, so it reads the deck once on open and then nothing tells it
// anything ever again. Meanwhile four screens write to the deck and each called
// its own `reload()`, which refreshed the screen that did the writing and left
// the numbers beside it saying what they said this morning. Finishing a session
// and watching "reviews today" not move is the symptom that found this.
//
// A page-local `EventTarget`, deliberately, and not any of:
//
//   - a `bb-subsgen:*` message. Those cross an origin boundary because they
//     have to (`messaging.md`); every writer here is on the extension page
//     already and holds the store directly.
//   - `chrome.storage` plus `onSettingsChanged`. The deck is IndexedDB, and
//     mirroring a change counter into storage to get a listener is a second
//     copy of state that can disagree with the first.
//   - props threaded from `App` through `Shell`. The relationship is not
//     parent-to-child: `Review` and `Aside` are siblings that never meet.
//
// The rule this leaves behind is one rule, not two: **a screen that reads the
// deck subscribes with `useDeckChanged(reload)`, and a screen that writes to it
// calls `deckChanged()`.** A writer does not also reload itself — it is
// subscribed, so it hears its own announcement. Keeping both calls at a write
// site is the version of this that gets half-applied by the next person.

import { useEffect } from 'preact/hooks'

const CHANGED = 'bb-subsgen:deck-changed'

const bus = new EventTarget()

/** Announce that the deck was written to. Synchronous: every listener runs before this returns. */
export function deckChanged(): void {
  bus.dispatchEvent(new Event(CHANGED))
}

/**
 * Re-read the deck whenever anything on this page writes to it.
 *
 * `onChange` has to be stable or the subscription churns every render —
 * `useAsync`'s `reload` already is, and is what every caller passes.
 */
export function useDeckChanged(onChange: () => void): void {
  useEffect(() => {
    bus.addEventListener(CHANGED, onChange)
    return () => bus.removeEventListener(CHANGED, onChange)
  }, [onChange])
}
