// Page-side half of the dictionary: asks the service worker instead of holding
// a store of its own. See src/dict/store.ts for why the store lives there.

import { translateGlosses, type GlossRequest } from '../dict/gloss-translate'
import type { Entry, Lexicon } from '../lang/pack'
import { packFor } from '../lang/packs'
import { createTranslator, isTranslatorSupported, translatorAvailability } from '../lang/translate'
import type { TranslationLang } from './settings'
import type {
  DictStatus,
  DictStatusMessage,
  DictStatusResponse,
  GetLexiconMessage,
  GetLexiconResponse,
  LookupDefsMessage,
  LookupDefsResponse,
  LookupGlossesMessage,
  LookupGlossesResponse,
  PutGlossesMessage,
} from './messages'

/**
 * What every card renderer needs to resolve headwords, however it's backed.
 *
 * Deliberately no language parameter. A page is one language for as long as it
 * is open, so the surfaces that render cards — the hover card, the reader —
 * partially apply `lookupDefs` once at setup and pass this in, rather than every
 * renderer between them and the message threading a language it never varies.
 */
export type DefsLookup = (headwords: string[]) => Promise<Record<string, Entry[]>>

function empty(headwords: string[]): Record<string, Entry[]> {
  return Object.fromEntries(headwords.map((headword) => [headword, []]))
}

/**
 * A missing definition is a degraded card, never a broken one — a worker that
 * failed to wake or a store that failed to open resolves to empty entries so
 * the pinyin and the sentence translation still render.
 *
 * `traditional` is required rather than defaulted: it decides which script the
 * answer is written in, and a caller that forgot it would silently get one
 * script's cross-references on the other script's page.
 */
export async function lookupDefs(
  lang: string,
  headwords: string[],
  traditional: boolean,
): Promise<Record<string, Entry[]>> {
  if (!headwords.length) return {}
  const message: LookupDefsMessage = {
    type: 'bb-subsgen:lookup-defs',
    lang,
    headwords,
    traditional,
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

/**
 * Glosses in the language the UI is in, translating whatever is not cached yet.
 *
 * Callable from a content script or an extension page alike, which is the point:
 * the Translator API exists in both and in neither worker, so the caller does
 * the translating and the worker only remembers the answer.
 *
 * Never throws and never blocks a render on a translation. A headword missing
 * from the result is one the caller should show its English for — degraded, but
 * a definition.
 */
export async function translatedGlosses(
  lang: string,
  target: TranslationLang,
  requests: GlossRequest[],
): Promise<Record<string, string[]>> {
  return translateGlosses(requests, target, {
    translator: async () => {
      if (!isTranslatorSupported()) return null
      // en→target, not zh→target: the text going in is the English the
      // dictionary shipped, and en→X is the best-supported direction Chrome has.
      if ((await translatorAvailability(target, 'en')) === 'unavailable') return null
      return createTranslator(target, undefined, 'en')
    },
    // No model fallback from here. A content script cannot reach localhost at
    // all (see the origin rules in .claude/rules/architecture.md), and on an
    // extension page a hover is interactive work that must not queue behind a
    // translation pass on the one GPU.
    viaModel: async () => {
      throw new Error('no local-model fallback on this surface')
    },
    read: async (headwords) => {
      const message: LookupGlossesMessage = {
        type: 'bb-subsgen:lookup-glosses',
        lang,
        target,
        headwords,
      }
      try {
        const response = (await chrome.runtime.sendMessage(message)) as
          LookupGlossesResponse | undefined
        return response?.glosses ?? {}
      } catch (e) {
        console.warn('[bb-subsgen] gloss lookup failed', e)
        return {}
      }
    },
    write: async (entries) => {
      const message: PutGlossesMessage = {
        type: 'bb-subsgen:put-glosses',
        lang,
        target,
        glosses: Object.fromEntries(entries),
      }
      try {
        await chrome.runtime.sendMessage(message)
      } catch (e) {
        // Costs a re-translation next time, nothing more.
        console.warn('[bb-subsgen] gloss write failed', e)
      }
    },
  })
}
