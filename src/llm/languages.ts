// What the model needs to be told about the target language, in one place.
//
// Split out of batch.ts and prompts.ts because both named every language and
// they had drifted into two copies of the same table. It holds wording, not
// policy: which language a pass runs in is `settings.translationLang`, and
// nothing here decides it.
//
// Deliberately not a field on the language packs in `src/lang/`. Those describe
// the language being *studied* — how it segments, how it reads — and a target
// language is never studied and has no lexicon. Sharing the shape would mean a
// pack per target with every field but one left empty.

import type { TranslationLang } from '../shared/settings'

/** How the model is told to name the language. English names: the prompt is English. */
export const LANGUAGE_NAME: Record<TranslationLang, string> = {
  en: 'English',
  ru: 'Russian',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  pt: 'Portuguese',
}

export interface LanguageRules {
  /** Appended to the system turn, after the rules every language gets. */
  system: string[]
  /**
   * One line repeated immediately before the subtitle lines themselves.
   *
   * Carried per language rather than written at the call site: it used to be a
   * literal about gender endings, emitted for any language that had rules at
   * all, so the first non-gendered language to need a rule would have been told
   * to match genders it does not mark.
   */
  reminder: string
}

/**
 * Rules that only some target languages need.
 *
 * Chinese marks no gender on verbs or adjectives, and no formality on anything
 * but the 你/您 pronoun. A translation into a language that marks either has to
 * decide something the source never said. A small model decides it twice in one
 * sentence and contradicts itself — the reported case was 你愿意做我的老公吗 as
 * "Ты согласна быть моим мужем?", feminine on the adjective and male on the
 * noun, in six words.
 *
 * Kept out of the shared rules rather than added to them: English needs none of
 * this, and the four shared rules are already as many as a small quantized
 * model reliably holds. A language that does not need a rule should not pay
 * prefill for it on every batch of every video.
 *
 * The four Latin-script entries are shorter than the Russian one on purpose.
 * Russian marks gender on past-tense verbs, short adjectives and participles
 * alike, so it needs the inventory spelled out; Spanish, French and Portuguese
 * mark it on adjectives and participles only, and German barely marks it on
 * predicates at all — its real trap is du/Sie, which is why its entry leads
 * with formality and does not mention agreement.
 */
export const LANGUAGE_RULES: Partial<Record<TranslationLang, LanguageRules>> = {
  ru: {
    system: [
      'Russian marks gender on past-tense verbs, short adjectives and participles. Work out from the line and the ones around it who is speaking and who is being spoken to — 老公, 老婆, 姐姐, 哥哥, 先生, 小姐, 儿子, 女儿 settle it — and keep every ending in a sentence agreeing with that one decision.',
      'Chinese marks formality only on 您. Use ты between friends and family and вы for strangers and superiors, and do not switch inside a scene.',
      'When nothing in the passage settles it, prefer wording that does not force a choice over guessing at one.',
    ],
    reminder: 'Match every gender ending to who is speaking and who is being spoken to.',
  },
  es: {
    system: [
      'Spanish marks gender on adjectives and participles describing a person. Work out from the passage who is speaking and who is being spoken to — 老公, 老婆, 姐姐, 哥哥, 先生, 小姐, 儿子, 女儿 settle it — and keep every ending agreeing with that one decision.',
      'Chinese marks formality only on 您. Use tú between friends and family and usted for strangers and superiors, and do not switch inside a scene.',
      'When nothing in the passage settles it, prefer wording that does not force a choice over guessing at one.',
    ],
    reminder: 'Match every gender ending to who is speaking and who is being spoken to.',
  },
  pt: {
    system: [
      'Portuguese marks gender on adjectives and participles describing a person. Work out from the passage who is speaking and who is being spoken to — 老公, 老婆, 姐姐, 哥哥, 先生, 小姐, 儿子, 女儿 settle it — and keep every ending agreeing with that one decision.',
      'Chinese marks formality only on 您. Use você throughout unless the line is plainly deferential, and do not switch inside a scene.',
      'When nothing in the passage settles it, prefer wording that does not force a choice over guessing at one.',
    ],
    reminder: 'Match every gender ending to who is speaking and who is being spoken to.',
  },
  fr: {
    system: [
      'French marks gender on adjectives and on participles agreeing with être. Work out from the passage who is speaking and who is being spoken to — 老公, 老婆, 姐姐, 哥哥, 先生, 小姐, 儿子, 女儿 settle it — and keep every ending agreeing with that one decision.',
      'Chinese marks formality only on 您. Use tu between friends and family and vous for strangers and superiors, and do not switch inside a scene.',
      'When nothing in the passage settles it, prefer wording that does not force a choice over guessing at one.',
    ],
    reminder: 'Match every gender ending to who is speaking and who is being spoken to.',
  },
  de: {
    system: [
      'Chinese marks formality only on 您, and German marks it on every verb in the sentence. Decide once from the passage: use du between friends and family and Sie for strangers and superiors, and do not switch inside a scene.',
      'When nothing in the passage settles it, prefer wording that does not force a choice over guessing at one.',
    ],
    reminder: 'Keep du or Sie consistent with who is being spoken to.',
  },
}
