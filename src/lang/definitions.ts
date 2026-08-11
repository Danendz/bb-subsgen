import { toDiacriticPhrase } from './tone'

export interface Classifier {
  word: string
  /** CC-CEDICT numeric-tone pinyin, e.g. "ge4" — kept raw so it can be tone-colored on render. */
  pinyin: string
}

export interface ParsedDefinitions {
  definitions: string[]
  classifiers: Classifier[]
}

// A single classifier: `个[ge4]`, or `個|个[ge4]` when traditional and
// simplified differ. Multiple are comma-separated.
const CLASSIFIER_RE = /([^,|\[\]]+)(?:\|([^,\[\]]+))?\[([^\]]+)\]/g
const STANDALONE_CL_RE = /^CL:(.+)$/
const EMBEDDED_CL_RE = /\s*\(CL:([^)]*)\)/g

// Characters a referenced headword may contain. Beyond Han these are rare but
// real in the data: digits (95后), latin (B型超声), the punctuation that
// separates clauses in idioms or syllables in transliterated names, and the
// wildcards a few entries use to stand in for an omitted word (∼的大门).
const HEADWORD_CHAR = '[\\p{Script=Han}\\p{Nd}A-Za-z，、·∼…]'
// Requires at least one Han character, so english prose before a bracket
// ("Taiwan pr. [jing4]") is never mistaken for a headword.
const HEADWORD = `(?:${HEADWORD_CHAR}*\\p{Script=Han}${HEADWORD_CHAR}*)`

// A cross-reference to another headword, e.g. `事[shi4]` or
// `信用證|信用证[xin4 yong4 zheng4]`. The word is optional — some entries
// annotate a reading alone, as in "Taiwan pr. [jing4]".
const REFERENCE_RE = new RegExp(`(?:(${HEADWORD})\\|)?(${HEADWORD})?\\[([^\\]]+)\\]`, 'gu')

// A traditional|simplified pair with no reading attached, e.g. `牛郎織女|牛郎织女`.
const BARE_PAIR_RE = new RegExp(`(${HEADWORD})\\|(${HEADWORD})`, 'gu')

function parseClassifierList(list: string, useTraditional: boolean): Classifier[] {
  const classifiers: Classifier[] = []
  for (const [, traditional, simplified, pinyin] of list.matchAll(CLASSIFIER_RE)) {
    // Without a `|` the single form serves as both scripts.
    const word = simplified ? (useTraditional ? traditional : simplified) : traditional
    classifiers.push({ word, pinyin })
  }
  return classifiers
}

/**
 * Rewrites cross-references to other headwords into readable form:
 * `信用證|信用证[xin4 yong4 zheng4]` becomes `信用证 (xìn yòng zhèng)`.
 *
 * Bracket contents that aren't tonal pinyin — proper-name separators, Greek
 * letters — pass through untouched, since toDiacritic only rewrites syllables
 * ending in a tone digit.
 */
function prettifyReferences(text: string, useTraditional: boolean): string {
  const withReadings = text.replace(
    REFERENCE_RE,
    (_match, traditional, simplified, pinyin) => {
      const word = traditional ? (useTraditional ? traditional : simplified) : simplified
      const reading = toDiacriticPhrase(pinyin)
      return word ? `${word} (${reading})` : `(${reading})`
    },
  )
  // Whatever pairs remain carried no reading of their own.
  return withReadings.replace(BARE_PAIR_RE, (_match, traditional, simplified) =>
    useTraditional ? traditional : simplified,
  )
}

/**
 * Splits CC-CEDICT classifier (measure word) notation out of definition text.
 *
 * Classifiers appear either as a whole definition (`CL:個|个[ge4],位[wei4]`) or
 * parenthesised inside one (`light; ray (CL:道[dao4])`). Both are lifted out so
 * raw dictionary syntax never reaches the UI and classifiers stop consuming
 * the popup's limited definition slots.
 */
export function parseDefinitions(defs: string[], useTraditional = false): ParsedDefinitions {
  const definitions: string[] = []
  const classifiers: Classifier[] = []

  for (const def of defs) {
    const standalone = STANDALONE_CL_RE.exec(def)
    if (standalone) {
      classifiers.push(...parseClassifierList(standalone[1], useTraditional))
      continue
    }

    for (const [, list] of def.matchAll(EMBEDDED_CL_RE)) {
      classifiers.push(...parseClassifierList(list, useTraditional))
    }
    const stripped = def.replace(EMBEDDED_CL_RE, '').trim()
    if (stripped) definitions.push(prettifyReferences(stripped, useTraditional))
  }

  const seen = new Set<string>()
  const unique = classifiers.filter((c) => {
    const key = `${c.word}[${c.pinyin}]`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  return { definitions, classifiers: unique }
}
