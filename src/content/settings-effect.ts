// What a settings change does to the passes that are running.
//
// This was an if/else chain in `main.ts` where exactly one branch fired, and the
// precedence between the branches — language beats toggle beats model config —
// was visible only in the order they happened to be written. It is a decision
// with seven outcomes and it took a video to exercise any of them.
//
// A union rather than a set of booleans because the branches really are mutually
// exclusive: switching the target language restarts both passes, which is
// already what turning translation off and on again would have done, so there is
// no case where two of these are both wanted.

import type { Settings } from '../shared/settings'

/**
 * The one thing to do about a settings change.
 *
 * `reload` is the only one that does not repaint afterwards, because reloading
 * the video rebuilds the overlay that would have been repainted.
 */
export type SettingsEffect =
  /** `enabled` flipped — reload the video, and do not repaint. */
  | 'reload'
  /** The target language changed: stop both passes and start both. */
  | 'restart-passes'
  /** Translation was switched on. */
  | 'start-passes'
  /** Translation was switched off. */
  | 'stop-passes'
  /** The model translator's configuration changed and it is now usable. */
  | 'start-llm'
  /** The model translator's configuration changed and it is now not. */
  | 'stop-llm'
  /** Nothing pass-related changed — re-render and nothing else. */
  | 'repaint'

/**
 * Which single effect a change has, in precedence order.
 *
 * The order is the point. `enabled` wins because it decides whether there is an
 * overlay at all. The target language wins over the toggle because a restart is
 * strictly more than a start. The toggle wins over the model configuration
 * because `showTranslation` being off means no pass runs whatever the model is
 * pointed at.
 *
 * Nothing here clears a cache: the caches are keyed by language and survive all
 * of this, which is what makes switching back to a finished language instant.
 */
export function settingsEffect(prev: Settings, next: Settings): SettingsEffect {
  if (next.enabled !== prev.enabled) return 'reload'
  if (next.translationLang !== prev.translationLang) return 'restart-passes'
  if (next.showTranslation !== prev.showTranslation) {
    return next.showTranslation ? 'start-passes' : 'stop-passes'
  }

  const llmChanged =
    next.llmEnabled !== prev.llmEnabled ||
    next.llmTranslationEnabled !== prev.llmTranslationEnabled ||
    next.llmTranslationModel !== prev.llmTranslationModel ||
    // Pointing at a different server is as much a change of translator as
    // picking a different model, and leaving it out meant correcting a typo'd
    // URL took a page reload to have any effect.
    next.llmBaseUrl !== prev.llmBaseUrl
  if (!llmChanged) return 'repaint'

  // Turned on mid-video the worker already has everything it needs to start, and
  // everything cached from a previous viewing comes back at once. Whether the
  // server and model are actually filled in is the pass's own guard — this only
  // decides which direction the change was in.
  return next.llmEnabled && next.llmTranslationEnabled ? 'start-llm' : 'stop-llm'
}
