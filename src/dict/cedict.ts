// CC-CEDICT parsing, runtime rather than a build step.
//
// This used to run once, at dev time, as tools/build-dict.ts — the format and
// the ranking are unchanged, only the file I/O is gone. It moved here so a Web
// Store install can download and parse CC-CEDICT itself instead of shipping a
// build artifact nobody but a developer could regenerate. See src/dict/install.ts
// for the streaming download that calls this.
//
// CC-CEDICT is CC BY-SA 4.0 (https://cc-cedict.org). Attribution required
// wherever this derived data is shown or redistributed.
import { excludeFromSegmentation, rankEntries } from '../lang/zh/entries'
import { functionWord } from '../lang/zh/grammar/function-words'

export interface CedictEntry {
  simplified: string
  traditional: string
  pinyin: string
  definitions: string[]
}

const LINE_RE = /^(\S+)\s+(\S+)\s+\[([^\]]*)\]\s+\/(.+)\/$/

function normalizePinyin(raw: string): string {
  return raw.replaceAll('u:', 'ü').replaceAll('U:', 'Ü')
}

/**
 * Parses one CC-CEDICT line. Null for a comment or a line that doesn't match.
 *
 * The CR is dropped here rather than by the caller because CRLF is what
 * CC-CEDICT is published as — 124,911 lines and 124,911 CR bytes, with no
 * terminator on the last one. install.ts splits the download on '\n' as it
 * streams, so every line but that last arrives with its CR still attached, and
 * `LINE_RE` is anchored: `$` will not match ahead of one. Leaving it on
 * rejected all 124,910 of them and let only the unterminated final line
 * through, which is an install that reports success with an `entryCount` of 1
 * and an overlay with no pinyin and no glosses.
 */
export function parseCedictLine(raw: string): CedictEntry | null {
  const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw
  if (!line || line.startsWith('#')) return null
  const match = LINE_RE.exec(line)
  if (!match) return null
  const [, traditional, simplified, pinyinRaw, defsRaw] = match
  return {
    simplified,
    traditional,
    pinyin: normalizePinyin(pinyinRaw),
    definitions: defsRaw.split('/').filter(Boolean),
  }
}

export function groupByHeadword(entries: CedictEntry[]): Map<string, CedictEntry[]> {
  const byHeadword = new Map<string, CedictEntry[]>()
  for (const entry of entries) {
    for (const key of new Set([entry.simplified, entry.traditional])) {
      const existing = byHeadword.get(key)
      if (existing) existing.push(entry)
      else byHeadword.set(key, [entry])
    }
  }
  return byHeadword
}

/**
 * Picks one reading per headword, and flags the ones that are not words.
 *
 * Taking the first entry gives the wrong reading whenever CC-CEDICT lists a
 * surname first — 也 is "Ye3 surname Ye" before "ye3 also; too", and 过 is
 * "Guo1 surname Guo" before "guo4 to cross" — so the ruby annotation showed a
 * capitalized proper noun over ordinary words. Ranking demotes proper nouns
 * and variant stubs, which corrects ~1500 headwords.
 *
 * The `p` flag marks phrasebook entries (see `isPhrase`). They keep their
 * reading so the dictionary can still find them; segmentation skips them.
 *
 * Function words override ranking entirely. Sense count is the right tiebreak
 * for content characters, and exactly the wrong one for the closed class, whose
 * grammatical reading is the commonest on screen and the thinnest in the
 * dictionary — so the table declares those, and they are fed in as the
 * preferred reading rather than left to be inferred.
 */
export function buildLexiconText(byHeadword: Map<string, CedictEntry[]>): string {
  const lines: string[] = []
  for (const [word, candidates] of byHeadword) {
    const [best] = rankEntries(candidates, word, functionWord(word)?.reading)
    lines.push(`${word}\t${best.pinyin}${excludeFromSegmentation(best, word) ? '\tp' : ''}`)
  }
  return lines.join('\n')
}
