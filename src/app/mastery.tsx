// How well a card is known, shown the same way everywhere.
//
// The ladder rung *is* the mastery (see scheduler.ts), so this needs no scale of
// its own — it renders the state the scheduler already keeps. One picture in the
// review screen and in the dictionary, because two pictures of one quantity is
// how a user ends up believing they are two quantities.

import { LADDER, levelOf, MAX_LEVEL } from '../flashcards/scheduler'
import type { Item } from '../flashcards/types'

/**
 * The rung to draw for a card.
 *
 * A word you declared you already know is never scheduled, so it has no rung of
 * its own — it reads as full, because that is what the declaration means.
 */
export function masteryOf(item: Pick<Item, 'state' | 'interval' | 'level'>): number {
  return item.state === 'known' ? MAX_LEVEL : levelOf(item)
}

export function masteryTitle(item: Pick<Item, 'state' | 'interval' | 'level'>): string {
  if (item.state === 'known') return 'Known — you marked this one yourself'
  const level = levelOf(item)
  if (level === MAX_LEVEL) return `Mastered — ${MAX_LEVEL} of ${MAX_LEVEL}`
  const days = LADDER[level]
  return `${level} of ${MAX_LEVEL} · ${days === 0 ? 'still learning' : `next in ${days} day${days === 1 ? '' : 's'}`}`
}

export interface PipsProps {
  level: number
  /** Amber instead of mint, for a rung that has just been lost. */
  lost?: boolean
  compact?: boolean
}

export function Pips({ level, lost = false, compact = false }: PipsProps) {
  return (
    <span class={`pips ${compact ? 'compact' : ''} ${lost ? 'lost' : ''}`} aria-hidden="true">
      {Array.from({ length: MAX_LEVEL }, (_, i) => (
        <span key={i} class={`pip ${i < level ? 'lit' : ''}`} />
      ))}
    </span>
  )
}
