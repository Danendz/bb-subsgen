import type { CedictEntry } from './lexicon'

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

/**
 * Whether a headword is a phrasebook line rather than a word.
 *
 * CC-CEDICT documents some character sequences that are not lexical units at
 * all — 過得|过得 is glossed "How are you getting by?", but in 时间过得很快 it is
 * a verb followed by a structural particle. Greedy segmentation cannot tell the
 * difference, so it took the span, printed `guo4 de2` over a particle that reads
 * `de5`, and offered "How's life?" as the gloss.
 *
 * The test is deliberately narrow: a *capitalized* definition that *ends in
 * terminal punctuation* is prose, not a sense. Neither signal is enough alone —
 * 什么 glosses as "what?" and every proper noun is capitalized, and both must
 * keep segmenting. Excluding too little is recoverable; excluding a real word
 * takes it out of the language.
 */
export function isPhrase(entry: CedictEntry): boolean {
  const [primary] = entry.definitions
  if (!primary) return false
  return /^[A-Z]/.test(primary) && /[.!?]$/.test(primary.trim())
}

/**
 * Headwords that are real words but far worse readings than the two words they
 * are made of.
 *
 * 我去 is the case that forced this: CC-CEDICT lists it as internet slang for
 * "what the ...!", which is true, and nothing about the entry reveals that
 * 我 + 去 ("I go") is hundreds of times commoner. Only frequency separates them,
 * and no frequency list ships with this extension — every usable one is somebody
 * else's to license, which is why the word-list feature asks you to supply your
 * own. So the handful of headwords in this position are named here instead.
 *
 * Named rather than inferred on purpose. The tempting general rule — distrust a
 * compound beginning with a pronoun — takes 你好 and 我们 down with it.
 *
 * Keep this list short. It is an admission that a signal is missing, not a place
 * to fix segmentation one word at a time.
 */
const NOT_A_WORD_SPAN: ReadonlySet<string> = new Set([
  '我去', // (slang) what the ...! — vs 我 + 去
])

/** Whether a headword must never claim a span while cutting a sentence into words. */
export function excludeFromSegmentation(entry: CedictEntry, headword: string): boolean {
  return NOT_A_WORD_SPAN.has(headword) || isPhrase(entry)
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

  // Tiebreak: the reading a character is usually given is the one lexicographers
  // had the most to say about. Without this, two readings of one character were
  // separated by nothing but file order — and CC-CEDICT sorts by reading, so the
  // rare one often came first. 说 shipped as `shui4` ("to persuade") rather than
  // `shuo1`, and 跑 as `pao2` ("to paw the ground") rather than `pao3`.
  //
  // Capped, and small enough to sit under every signal above it: a rich rare
  // sense must not outvote the reading actually displayed on the subtitle.
  value += Math.min(entry.definitions.length, 5)

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
