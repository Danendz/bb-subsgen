// Converts CC-CEDICT (cedict_ts.u8) into the two runtime artifacts:
//   public/dict/words.bin  — headword -> pinyin, eager-loaded Map (also the
//                            max-match word set for segmentation)
//   public/dict/defs.json  — headword -> CEDICT entries, imported into
//                            IndexedDB once on install
//
// CC-CEDICT is CC BY-SA 4.0 (https://cc-cedict.org). Attribution required
// wherever this derived data is shown or redistributed.
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { rankEntries } from '../src/lang/entries.ts'

interface CedictEntry {
  simplified: string
  traditional: string
  pinyin: string
  definitions: string[]
}

const SRC = path.join(import.meta.dirname, 'data/cedict_ts.u8')
const OUT_DIR = path.join(import.meta.dirname, '../public/dict')

// Both optional. Neither ships with the repo: unlike CC-CEDICT, whose licence
// is known and attributed, a frequency or HSK list has to have its own
// redistribution terms checked before it can be bundled. Without them every
// rank is undefined, which costs frequency-ordered card introduction and the
// HSK progress denominator, and nothing else.
//
//   data/frequency.txt  one headword per line, most frequent first (rank = line number)
//   data/hsk.tsv        `headword<TAB>level` per line
const FREQ_SRC = path.join(import.meta.dirname, 'data/frequency.txt')
const HSK_SRC = path.join(import.meta.dirname, 'data/hsk.tsv')

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
 * Picks one reading per headword.
 *
 * Taking the first entry gives the wrong reading whenever CC-CEDICT lists a
 * surname first — 也 is "Ye3 surname Ye" before "ye3 also; too", and 过 is
 * "Guo1 surname Guo" before "guo4 to cross" — so the ruby annotation showed a
 * capitalized proper noun over ordinary words. Ranking demotes proper nouns
 * and variant stubs, which corrects ~1500 headwords.
 */
function buildWords(byHeadword: Map<string, CedictEntry[]>): string {
  const lines: string[] = []
  for (const [word, candidates] of byHeadword) {
    const [best] = rankEntries(candidates, word)
    lines.push(`${word}\t${best.pinyin}`)
  }
  return lines.join('\n')
}

function buildDefs(byHeadword: Map<string, CedictEntry[]>): Record<string, CedictEntry[]> {
  return Object.fromEntries(byHeadword)
}

/** Rank by line number; first occurrence wins, so a duplicated word keeps its best rank. */
function readFrequency(): Map<string, number> {
  const ranks = new Map<string, number>()
  if (!existsSync(FREQ_SRC)) return ranks
  let rank = 0
  for (const line of readFileSync(FREQ_SRC, 'utf8').split(/\r?\n/)) {
    // Tolerates `word<TAB>count` as well as a bare word, since frequency lists
    // are distributed both ways.
    const word = line.split(/\s+/)[0]?.trim()
    if (!word || word.startsWith('#')) continue
    rank += 1
    if (!ranks.has(word)) ranks.set(word, rank)
  }
  return ranks
}

function readHsk(): Map<string, number> {
  const levels = new Map<string, number>()
  if (!existsSync(HSK_SRC)) return levels
  for (const line of readFileSync(HSK_SRC, 'utf8').split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue
    const [word, level] = line.split('\t')
    const parsed = Number(level)
    if (!word || !Number.isFinite(parsed)) continue
    levels.set(word.trim(), parsed)
  }
  return levels
}

/**
 * Joins whatever rank data exists onto the dictionary's own headwords.
 *
 * Restricted to words CC-CEDICT actually knows: a frequency list carries
 * particles, fragments and proper nouns the extension can never render a card
 * for, and carrying them would inflate the progress denominator with words that
 * are unreachable by design.
 */
function buildRanks(
  byHeadword: Map<string, CedictEntry[]>,
  frequency: Map<string, number>,
  hsk: Map<string, number>,
): string {
  const lines: string[] = []
  for (const word of byHeadword.keys()) {
    const rank = frequency.get(word)
    const level = hsk.get(word)
    if (rank === undefined && level === undefined) continue
    lines.push(`${word}\t${rank ?? ''}\t${level ?? ''}`)
  }
  return lines.join('\n')
}

const src = readFileSync(SRC, 'utf8')
const entries = parse(src)

const byHeadword = groupByHeadword(entries)

mkdirSync(OUT_DIR, { recursive: true })
writeFileSync(path.join(OUT_DIR, 'words.bin'), buildWords(byHeadword))
writeFileSync(path.join(OUT_DIR, 'defs.json'), JSON.stringify(buildDefs(byHeadword)))

console.log(`Parsed ${entries.length} CC-CEDICT entries`)

const frequency = readFrequency()
const hsk = readHsk()
if (frequency.size || hsk.size) {
  const ranks = buildRanks(byHeadword, frequency, hsk)
  writeFileSync(path.join(OUT_DIR, 'rank.bin'), ranks)
  console.log(
    `Ranked ${ranks ? ranks.split('\n').length : 0} headwords ` +
      `(${frequency.size} frequency, ${hsk.size} HSK)`,
  )
} else {
  console.log(
    'No frequency or HSK data — skipping rank.bin. ' +
      'Add tools/data/frequency.txt and/or tools/data/hsk.tsv to enable ' +
      'frequency-ordered card introduction and HSK progress.',
  )
}
