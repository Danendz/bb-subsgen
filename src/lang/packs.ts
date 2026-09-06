// Which pack a language code resolves to.
//
// Separate from `pack.ts` so the interface never imports an implementation:
// everything that only needs the shape imports that, and only the handful of
// entry points that resolve a studied language import this.
//
// Deliberately not folded into `DICT_SOURCES` (src/dict/sources.ts), which is
// keyed by the same codes. The two registries answer different questions —
// where the dictionary is downloaded from, and how the language is read — and
// merging them would make the popup and the badge, which only ever ask the
// first, transitively import a segmenter. `packs.test.ts` asserts they agree on
// which languages exist, which is the part that actually has to stay true.

import type { LanguagePack } from './pack'
import { japanesePack } from './ja/pack'
import { chinesePack } from './zh/pack'

export const PACKS: Record<string, LanguagePack> = {
  zh: chinesePack,
  ja: japanesePack,
}

/**
 * Null where the code has no pack, as `siteFor` is null for a page the overlay
 * does not serve. Callers already have a "no dictionary for this language"
 * state to fold it into, so this needs no separate one.
 */
export function packFor(code: string): LanguagePack | null {
  return PACKS[code] ?? null
}

/**
 * The packs a settings row has to satisfy, given the language filter.
 *
 * `studyLang` is `''` for **All**, which is what the filter writes when you
 * want every installed language at once — so the answer is a list, not one
 * pack, and a row renders when any pack in it declares the capability. One
 * chosen language answers with that pack alone.
 *
 * Enabled rather than installed: this is asked during render, and the installed
 * set costs a database read the settings form does not otherwise make. The
 * difference is a language the wizard was told about and never downloaded,
 * which shows one extra row rather than hiding a live one.
 *
 * Nothing enabled at all is the window before the wizard has run, and it
 * answers with every pack: there is no filter yet to narrow anything by, and
 * hiding half the settings page from someone who has not finished setting up
 * would read as a broken screen rather than as a filter.
 */
export function packsInScope(studyLang: string, enabled: readonly string[]): LanguagePack[] {
  const codes = studyLang ? [studyLang] : enabled
  const scoped = codes.map(packFor).filter((pack): pack is LanguagePack => pack !== null)
  return scoped.length ? scoped : Object.values(PACKS)
}
