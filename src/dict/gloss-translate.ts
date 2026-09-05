// Definitions in the language you read the rest of the app in.
//
// CC-CEDICT and JMdict_e both ship English and only English, so a learner whose
// target is Spanish has always read Spanish subtitles above English glosses.
// This translates the glosses rather than sourcing them: CFDICT and HanDeDict
// exist for two of the six targets and nothing exists for the other four, so a
// per-language source would mean a dictionary matrix with holes in it and a
// different install per pair.
//
// The pair is en→target, never zh→target. The text going in is already English,
// and en→X is the best-supported direction Chrome's on-device translator has —
// which is why this can be cheap enough to run on hover at all.
//
// What it deliberately is not: an install-time pass. The dictionaries hold
// ~120k entries and a learner meets a few thousand, so this is lazy, per
// headword, and cached (`glosses` in src/dict/store.ts, schema 3).

import type { TranslationLang } from '../shared/settings'
import type { TranslatorLike } from '../lang/translate'

/**
 * Kept apart from the store so this module can be tested without IndexedDB and
 * without Chrome, in the same way `src/llm/client.ts` takes its `fetch`.
 */
export interface GlossTranslateDeps {
  /**
   * The on-device translator for en→target, or null where Chrome has no such
   * pair. Null is a normal answer, not a failure.
   */
  translator: () => Promise<TranslatorLike | null>
  /** The local model, used only when there is no translator to use instead. */
  viaModel: (senses: string[], target: TranslationLang) => Promise<string[]>
  read: (headwords: string[]) => Promise<Record<string, string[]>>
  write: (entries: Map<string, string[]>) => Promise<void>
}

/** The English senses of one headword, as the pack ranked them. */
export interface GlossRequest {
  headword: string
  senses: string[]
}

/**
 * Translates what is not cached and returns every headword asked for.
 *
 * A headword whose translation cannot be produced is absent from the result
 * rather than present and empty: the caller falls back to showing the English
 * it already has, which is worse than a translation and far better than a blank
 * definition. That fallback is the whole reason this never throws.
 */
export async function translateGlosses(
  requests: GlossRequest[],
  target: TranslationLang,
  deps: GlossTranslateDeps,
): Promise<Record<string, string[]>> {
  // English is the language the dictionaries are already in. Not a special case
  // so much as the absence of one — there is nothing to translate or cache.
  if (target === 'en' || !requests.length) return {}

  const cached = await deps.read(requests.map((r) => r.headword))
  const missing = requests.filter((r) => !cached[r.headword] && r.senses.length)
  if (!missing.length) return cached

  const translated = await translateMissing(missing, target, deps)
  if (translated.size) {
    // Written before returning, not after: the caller renders and moves on, and
    // an unawaited write is a write that loses the race with the worker being
    // torn down between two hovers.
    await deps.write(translated)
  }

  return { ...cached, ...Object.fromEntries(translated) }
}

async function translateMissing(
  missing: GlossRequest[],
  target: TranslationLang,
  deps: GlossTranslateDeps,
): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>()

  let translator: TranslatorLike | null = null
  try {
    translator = await deps.translator()
  } catch {
    // An unavailable pair and a translator that failed to build are the same
    // thing here: fall through to the model.
    translator = null
  }

  for (const request of missing) {
    try {
      const senses = translator
        ? await Promise.all(request.senses.map((sense) => translator!.translate(sense)))
        : await deps.viaModel(request.senses, target)
      // A translator that answers with nothing has not translated anything, and
      // caching that would make the blank permanent.
      if (senses.length === request.senses.length && senses.every((s) => s.trim())) {
        out.set(request.headword, senses)
      }
    } catch {
      // One headword failing is not a reason to lose the ones that worked; the
      // caller shows English for this word and asks again next time.
      continue
    }
  }

  return out
}
