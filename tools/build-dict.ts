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

function buildWords(entries: CedictEntry[]): string {
  const words = new Map<string, string>()
  for (const entry of entries) {
    if (!words.has(entry.simplified)) words.set(entry.simplified, entry.pinyin)
    if (!words.has(entry.traditional)) words.set(entry.traditional, entry.pinyin)
  }
  const lines: string[] = []
  for (const [word, pinyin] of words) lines.push(`${word}\t${pinyin}`)
  return lines.join('\n')
}

function buildDefs(entries: CedictEntry[]): Record<string, CedictEntry[]> {
  const defs: Record<string, CedictEntry[]> = {}
  for (const entry of entries) {
    for (const key of new Set([entry.simplified, entry.traditional])) {
      ;(defs[key] ??= []).push(entry)
    }
  }
  return defs
}

const src = readFileSync(SRC, 'utf8')
const entries = parse(src)

mkdirSync(OUT_DIR, { recursive: true })
writeFileSync(path.join(OUT_DIR, 'words.bin'), buildWords(entries))
writeFileSync(path.join(OUT_DIR, 'defs.json'), JSON.stringify(buildDefs(entries)))

console.log(`Parsed ${entries.length} CC-CEDICT entries`)
