import type { Item } from './types'

/**
 * Review interval at which a word stops being annotated, in days.
 *
 * Anki's "mature" convention. It is the same threshold for hiding pinyin and
 * for the capture rule, deliberately: a word the overlay has stopped annotating
 * must also stop making lines look worth capturing, or the pool would keep
 * collecting sentences whose only "unknown" word you demonstrably read fine.
 */
export const MATURE_INTERVAL_DAYS = 21

export function isKnown(item: Pick<Item, 'state' | 'interval'>): boolean {
  if (item.state === 'known') return true
  return item.state === 'review' && item.interval >= MATURE_INTERVAL_DAYS
}

/** Where the worker mirrors the known set for content scripts to read. */
export const KNOWN_SET_KEY = 'bbSubsgenKnown'

/**
 * The mirror's stored shape: language code → the words to stop annotating.
 *
 * Keyed by language because marking Japanese 生 known must not stop Chinese 生
 * being annotated. A bare array of headwords cannot say which of those two it
 * meant.
 */
export type KnownMirror = Record<string, string[]>

/**
 * The mirror as a record, whatever shape is actually in storage.
 *
 * This is `chrome.storage`, not IndexedDB, so there is no upgrade hook to run
 * once — the coercion has to live in the read path, and in *every* read path.
 * The same lesson `readerOrigins` taught: its `normalise` is needed on both
 * `loadSettings` and `onSettingsChanged`, and a mirror lifted on the first read
 * but not on the change event un-annotates the whole page the next time a word
 * is marked known.
 *
 * A stored plain array is the pre-#12 shape, written when Chinese was the only
 * language there was.
 */
export function knownMirror(stored: unknown): KnownMirror {
  if (Array.isArray(stored)) return { zh: stored as string[] }
  if (typeof stored === 'object' && stored !== null) return stored as KnownMirror
  return {}
}

/** The words one language should stop annotating. */
export function knownWordsFor(stored: unknown, lang: string): Set<string> {
  return new Set(knownMirror(stored)[lang] ?? [])
}
