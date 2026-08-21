// Page-side half of the dictionary: asks the service worker instead of holding
// a store of its own. See background/defs-store.ts for why the store lives there.

import type { CedictEntry } from '../lang/dict'
import type { LookupDefsMessage, LookupDefsResponse } from './messages'

/** What every card renderer needs to resolve headwords, however it's backed. */
export type DefsLookup = (headwords: string[]) => Promise<Record<string, CedictEntry[]>>

function empty(headwords: string[]): Record<string, CedictEntry[]> {
  return Object.fromEntries(headwords.map((headword) => [headword, []]))
}

/**
 * A missing definition is a degraded card, never a broken one — a worker that
 * failed to wake or a store that failed to open resolves to empty entries so
 * the pinyin and the sentence translation still render.
 */
export const lookupDefs: DefsLookup = async (headwords) => {
  if (!headwords.length) return {}
  const message: LookupDefsMessage = {
    type: 'bb-subsgen:lookup-defs',
    headwords,
  }
  try {
    const response = (await chrome.runtime.sendMessage(message)) as LookupDefsResponse | undefined
    return response?.entries ?? empty(headwords)
  } catch (e) {
    console.warn('[bb-subsgen] definition lookup failed', e)
    return empty(headwords)
  }
}
