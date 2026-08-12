import type { CedictEntry } from '../lang/dict'

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
