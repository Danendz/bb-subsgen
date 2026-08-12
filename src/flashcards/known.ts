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
