// Converts CC-CEDICT (cedict_ts.u8) into the two runtime artifacts:
//   public/dict/words.bin  — headword -> pinyin, eager-loaded Map (also the
//                            max-match word set for segmentation)
//   public/dict/defs.json  — headword -> CEDICT entries, imported into
//                            IndexedDB once on install
//
// CC-CEDICT is CC BY-SA 4.0 (https://cc-cedict.org). Attribution required
// wherever this derived data is shown or redistributed.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { excludeFromSegmentation, rankEntries } from '../src/lang/entries.ts'
import { functionWord } from '../src/lang/grammar/function-words.ts'

interface CedictEntry {
  simplified: string
  traditional: string
  pinyin: string
  definitions: string[]
}

const SRC = path.join(import.meta.dirname, 'data/cedict_ts.u8')
const OUT_DIR = path.join(import.meta.dirname, '../public/dict')


const LINE_RE = /^(\S+)\s+(\S+)\s+\[([^\]]*)\]\s+\/(.+)\/$/

function normalizePinyin(raw: string): string {
  return raw.replaceAll('u:', 'ü').replaceAll('U:', 'Ü')
}

function parse(src: string): CedictEntry[] {
  const entries: CedictEntry[] = []
  for (const line of src.split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue
    const match = LINE_RE.exec(line)
    if (!match) continue
    const [, traditional, simplified, pinyinRaw, defsRaw] = match
    entries.push({
      simplified,
      traditional,
      pinyin: normalizePinyin(pinyinRaw),
      definitions: defsRaw.split('/').filter(Boolean),
    })
  }
  return entries
}

function groupByHeadword(entries: CedictEntry[]): Map<string, CedictEntry[]> {
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
function buildWords(byHeadword: Map<string, CedictEntry[]>): string {
  const lines: string[] = []
  for (const [word, candidates] of byHeadword) {
    const [best] = rankEntries(candidates, word, functionWord(word)?.reading)
    lines.push(`${word}\t${best.pinyin}${excludeFromSegmentation(best, word) ? '\tp' : ''}`)
  }
  return lines.join('\n')
}

function buildDefs(byHeadword: Map<string, CedictEntry[]>): Record<string, CedictEntry[]> {
  return Object.fromEntries(byHeadword)
}

const src = readFileSync(SRC, 'utf8')
const entries = parse(src)

const byHeadword = groupByHeadword(entries)

mkdirSync(OUT_DIR, { recursive: true })
writeFileSync(path.join(OUT_DIR, 'words.bin'), buildWords(byHeadword))
writeFileSync(path.join(OUT_DIR, 'defs.json'), JSON.stringify(buildDefs(byHeadword)))

console.log(`Parsed ${entries.length} CC-CEDICT entries`)

