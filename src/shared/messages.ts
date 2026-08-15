import type { CedictEntry } from '../lang/dict'
import type { Context, ExposureBatch, Signal } from '../flashcards/types'

export type Status = 'loading' | 'no-track' | 'active'

export interface GetStatusMessage {
  type: 'bb-subsgen:get-status'
}

export interface StatusResponse {
  status: Status
}

export function isGetStatusMessage(msg: unknown): msg is GetStatusMessage {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    (msg as { type?: unknown }).type === 'bb-subsgen:get-status'
  )
}

/**
 * Asks the service worker for dictionary entries.
 *
 * Batched by design — see `lookupDefsIn` in background/defs-store.ts. The
 * definition store lives in the worker because content scripts would otherwise
 * each import it under their own page origin.
 */
export interface LookupDefsMessage {
  type: 'bb-subsgen:lookup-defs'
  headwords: string[]
}

export interface LookupDefsResponse {
  entries: Record<string, CedictEntry[]>
}

export function isLookupDefsMessage(msg: unknown): msg is LookupDefsMessage {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    (msg as { type?: unknown }).type === 'bb-subsgen:lookup-defs' &&
    Array.isArray((msg as { headwords?: unknown }).headwords)
  )
}

/**
 * Everything a content script asks the worker to write.
 *
 * One union with one guard rather than a message type and predicate each: these
 * are all fire-and-forget writes with the same handling, and the worker's
 * dispatch reads better as a single switch. Nothing here expects a response —
 * a dropped capture is not worth blocking a hover on.
 */
export type FlashcardsMessage =
  | { type: 'bb-subsgen:record-exposures'; batch: ExposureBatch }
  | { type: 'bb-subsgen:discover-word'; headword: string; context?: Context }
  | {
      type: 'bb-subsgen:capture-sentence'
      text: string
      context: Context
      target?: string
      /**
       * Unknown words in the line, pooled alongside it.
       *
       * Carried on this message rather than sent as a `discover-word` each is
       * what keeps capture affordable: a subtitle line changes every few seconds
       * and holds a handful of unknown words, so per-word messages would be
       * roughly one round trip and one transaction per second for the length of
       * a video — the cost `createExposureBuffer` exists to avoid.
       */
      words?: string[]
      /**
       * Grammar patterns the line was built out of, pooled alongside it.
       *
       * Rides this message for the same reason `words` does, and lands in the
       * same transaction — a pattern is only ever met *in* a line, so a line
       * arriving without the structure it taught would be a half-written fact.
       */
      patterns?: string[]
    }
  | { type: 'bb-subsgen:mark-known'; headword: string; known: boolean }
  | { type: 'bb-subsgen:record-signal'; signal: Signal }

const FLASHCARDS_TYPES = new Set<string>([
  'bb-subsgen:record-exposures',
  'bb-subsgen:discover-word',
  'bb-subsgen:capture-sentence',
  'bb-subsgen:mark-known',
  'bb-subsgen:record-signal',
])

export function isFlashcardsMessage(msg: unknown): msg is FlashcardsMessage {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    typeof (msg as { type?: unknown }).type === 'string' &&
    FLASHCARDS_TYPES.has((msg as { type: string }).type)
  )
}
