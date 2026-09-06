// What a language is still missing, in words.
//
// One table, read by the three places that say it: the badged rows in Settings
// › Language, the badge on the wizard's language card, and the tooltip on both.
// Separate from `pack.ts` because that file describes what a pack *is* and this
// one is prose about it — and because prose outside a component takes a
// `Translate` rather than reaching for a hook (`.claude/rules/architecture.md`).
//
// Every gap here is planned work. A capability a language will never have is
// hidden by the flags on `LanguagePack`, never listed here: a badge on it would
// be a promise with a timer on it that nobody set.

import type { MessageKey } from '../i18n/keys'
import type { Translate } from '../i18n/t'
import type { TranslationLang } from '../shared/settings'
import type { Gap, LanguagePack } from './pack'

/** The row's own label — "Japanese grammar patterns". */
const ROW: Record<Gap, MessageKey> = {
  patterns: 'gap.patterns.row',
  onDeviceTranslation: 'gap.onDevice.row',
}

/** What is missing and what happens instead, for the badge's `title`. */
const EXPLANATION: Record<Gap, MessageKey> = {
  patterns: 'gap.patterns.title',
  onDeviceTranslation: 'gap.onDevice.title',
}

/** The gap named as a noun phrase, for listing several in one sentence. */
const NOUN: Record<Gap, MessageKey> = {
  patterns: 'gap.patterns.noun',
  onDeviceTranslation: 'gap.onDevice.noun',
}

/** The label of the settings row a gap is badged on. */
export function gapRow(pack: LanguagePack, gap: Gap, t: Translate): string {
  return t(ROW[gap], { language: pack.name })
}

/** What that row's badge says when you hover it. */
export function gapExplanation(pack: LanguagePack, gap: Gap, t: Translate): string {
  return t(EXPLANATION[gap], { language: pack.name })
}

/**
 * Every gap in one sentence, for a badge that stands for the language rather
 * than for a single row — the wizard's card.
 *
 * `Intl.ListFormat` rather than joining on a comma: the conjunction between the
 * last two is a word, and it is not the same word in the six languages the app
 * is read in.
 */
export function gapSummary(pack: LanguagePack, t: Translate, lang: TranslationLang): string {
  if (pack.comingSoon.length === 0) return ''
  const missing = new Intl.ListFormat(lang, { type: 'conjunction' }).format(
    pack.comingSoon.map((gap) => t(NOUN[gap])),
  )
  return t('comingSoon.summary', { language: pack.name, missing })
}
