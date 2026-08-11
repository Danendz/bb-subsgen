import type { CedictEntry } from './dict'

// Definitions that only point at another headword rather than carrying a
// meaning of their own.
const STUB_RE = /^\s*\(?(?:old\s+|erhua\s+)?variant of\b|^\s*see\b|^\s*used in\b/i

function normalizePinyin(pinyin: string): string {
  return pinyin.trim().toLowerCase().replace(/\s+/g, ' ')
}

/** CC-CEDICT capitalizes readings of proper nouns, e.g. "He2" for the surname. */
function isProperNoun(pinyin: string): boolean {
  return /^[A-Z]/.test(pinyin.trim())
}

function isStub(entry: CedictEntry): boolean {
  return entry.definitions.every((definition) => STUB_RE.test(definition))
}

function score(
  entry: CedictEntry,
  headword: string,
  displayedPinyin: string | undefined,
  useTraditional: boolean,
): number {
  let value = 0

  // Strongest signal: the reading already shown above the character.
  if (displayedPinyin && normalizePinyin(entry.pinyin) === normalizePinyin(displayedPinyin)) {
    value += 100
  }

  // An entry whose own headword is this character in both scripts is the
  // canonical one. Entries reached only because their *other* script maps
  // here — 咊 and 龢 both simplify to 和 — rank below it.
  if (entry.simplified === headword && entry.traditional === headword) value += 50
  else if ((useTraditional ? entry.traditional : entry.simplified) === headword) value += 20

  if (isStub(entry)) value -= 40
  if (isProperNoun(entry.pinyin)) value -= 15

  return value
}

/**
 * Orders dictionary entries so the most useful sense comes first.
 *
 * The index is keyed by both scripts in file order, so `entries[0]` is
 * whichever line happened to appear first — for 和 that is the variant entry
 * keyed under 咊, which reads "old variant of 和" rather than "and".
 */
export function rankEntries(
  entries: CedictEntry[],
  headword: string,
  displayedPinyin?: string,
  useTraditional = false,
): CedictEntry[] {
  return entries
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => {
      const diff =
        score(b.entry, headword, displayedPinyin, useTraditional) -
        score(a.entry, headword, displayedPinyin, useTraditional)
      return diff !== 0 ? diff : a.index - b.index // stable within equal scores
    })
    .map(({ entry }) => entry)
}
