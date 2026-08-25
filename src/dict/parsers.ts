// Which parser reads a language's dictionary download.
//
// Separate from `sources.ts` and deliberately not a function field on
// `DictSource`, for the reason `packs.ts` records against merging itself into
// the same registry: the popup and the badge import `sources.ts` to ask where a
// dictionary comes from and whether it is installed, and a parser hanging off
// that record would pull every format's parser into both of their bundles.
// `install.ts` is the only importer of this file.

import { cedictParser } from './cedict'
import { jmdictParser } from './jmdict'
import type { DictParser } from './parser'

const PARSERS: Record<string, () => DictParser> = {
  zh: cedictParser,
  ja: jmdictParser,
}

/**
 * Null where the language has no parser, as `packFor` is null for a language
 * with no pack. The installer turns that into a refusal to start rather than a
 * download it would have nothing to do with.
 */
export function parserFor(lang: string): DictParser | null {
  return PARSERS[lang]?.() ?? null
}
