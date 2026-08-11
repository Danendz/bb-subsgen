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
    if (stripped) definitions.push(stripped)
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
