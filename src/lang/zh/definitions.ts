import type { Sense, Tag } from '../pack'
import { readingText } from '../reading'
import { readingParts } from './reading'
import { toDiacriticPhrase } from './tone'

// Definitions that only point at another headword rather than carrying a
// meaning of their own. Read by `rank`, which demotes an entry whose every
// sense is one of these.
const STUB_RE = /^\s*\(?(?:old\s+|erhua\s+)?variant of\b|^\s*see\b|^\s*used in\b/i

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

type ClassifierTag = Extract<Tag, { kind: 'classifier' }>

function parseClassifierList(list: string, useTraditional: boolean): ClassifierTag[] {
  const classifiers: ClassifierTag[] = []
  for (const [, traditional, simplified, pinyin] of list.matchAll(CLASSIFIER_RE)) {
    // Without a `|` the single form serves as both scripts.
    const word = simplified ? (useTraditional ? traditional : simplified) : traditional
    classifiers.push({ kind: 'classifier', word, reading: readingParts(word, pinyin) })
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
  const withReadings = text.replace(REFERENCE_RE, (_match, traditional, simplified, pinyin) => {
    const word = traditional ? (useTraditional ? traditional : simplified) : simplified
    const reading = toDiacriticPhrase(pinyin)
    return word ? `${word} (${reading})` : `(${reading})`
  })
  // Whatever pairs remain carried no reading of their own.
  return withReadings.replace(BARE_PAIR_RE, (_match, traditional, simplified) =>
    useTraditional ? traditional : simplified,
  )
}

/**
 * What a row's definition strings say, once no dictionary notation is left in
 * them.
 *
 * Classifiers come back separately rather than on the sense they were written
 * against. They appear both ways in the data — as a whole definition
 * (`CL:個|个[ge4],位[wei4]`) and parenthesised inside one (`light; ray
 * (CL:道[dao4])`) — and the standalone form is the common one, which leaves no
 * gloss and so no sense to hang the tag on. A measure word is a fact about the
 * word anyway, not about one of its meanings, and the card draws one measure
 * row per entry.
 */
export function parseDefinitions(
  defs: string[],
  useTraditional = false,
): { senses: Sense[]; classifiers: ClassifierTag[] } {
  const senses: Sense[] = []
  const classifiers: ClassifierTag[] = []

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
    if (!stripped) continue
    senses.push({
      gloss: prettifyReferences(stripped, useTraditional),
      // Tested against the raw text, not the prettified gloss: prettifying
      // rewrites `see 事[shi4]` into `see 事 (shì)`, and the regex is anchored
      // on notation that by then is gone.
      tags: STUB_RE.test(stripped) ? [{ kind: 'stub' }] : [],
    })
  }

  const seen = new Set<string>()
  const unique = classifiers.filter((c) => {
    const key = `${c.word}[${readingText(c.reading)}]`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  return { senses, classifiers: unique }
}
