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
import { chinesePack } from './zh/pack'

export const PACKS: Record<string, LanguagePack> = {
  zh: chinesePack,
}

/**
 * Null where the code has no pack, as `siteFor` is null for a page the overlay
 * does not serve. Callers already have a "no dictionary for this language"
 * state to fold it into, so this needs no separate one.
 */
export function packFor(code: string): LanguagePack | null {
  return PACKS[code] ?? null
}
