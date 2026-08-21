// Page-side half of the dictionary: asks the service worker instead of holding
// a store of its own. See src/dict/store.ts for why the store lives there.

import type { CedictEntry } from '../dict/cedict'
import type { Lexicon } from '../lang/pack'
import { packFor } from '../lang/packs'
import type {
  DictStatus,
  DictStatusMessage,
  DictStatusResponse,
  GetLexiconMessage,
  GetLexiconResponse,
  LookupDefsMessage,
  LookupDefsResponse,
} from './messages'

/**
 * What every card renderer needs to resolve headwords, however it's backed.
 *
 * Deliberately no language parameter. A page is one language for as long as it
 * is open, so the surfaces that render cards — the hover card, the reader —
 * partially apply `lookupDefs` once at setup and pass this in, rather than every
 * renderer between them and the message threading a language it never varies.
 */
export type DefsLookup = (headwords: string[]) => Promise<Record<string, CedictEntry[]>>

function empty(headwords: string[]): Record<string, CedictEntry[]> {
  return Object.fromEntries(headwords.map((headword) => [headword, []]))
}

/**
 * A missing definition is a degraded card, never a broken one — a worker that
 * failed to wake or a store that failed to open resolves to empty entries so
 * the pinyin and the sentence translation still render.
 */
export async function lookupDefs(
  lang: string,
  headwords: string[],
): Promise<Record<string, CedictEntry[]>> {
  if (!headwords.length) return {}
  const message: LookupDefsMessage = {
    type: 'bb-subsgen:lookup-defs',
    lang,
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

async function getLexicon(lang: string): Promise<string | null> {
  const message: GetLexiconMessage = { type: 'bb-subsgen:get-lexicon', lang }
  try {
    const response = (await chrome.runtime.sendMessage(message)) as GetLexiconResponse | undefined
    return response?.text ?? null
  } catch (e) {
    console.warn('[bb-subsgen] lexicon fetch failed', e)
    return null
  }
}

/**
 * The page-origin half of loading a lexicon: asks the worker rather than
 * fetching `dict/words.bin` directly, since that file no longer ships. Null
 * means the language has no dictionary installed — callers show a "not
 * installed" state rather than segmenting against an empty lexicon.
 */
export async function loadLexicon(lang: string): Promise<Lexicon | null> {
  const pack = packFor(lang)
  if (!pack) return null
  const text = await getLexicon(lang)
  return text === null ? null : pack.load(text)
}

export async function dictStatus(): Promise<DictStatus[]> {
  const message: DictStatusMessage = { type: 'bb-subsgen:dict-status' }
  try {
    const response = (await chrome.runtime.sendMessage(message)) as DictStatusResponse | undefined
    return response?.languages ?? []
  } catch (e) {
    console.warn('[bb-subsgen] dict status failed', e)
    return []
  }
}
