// Reading a frequency or HSK list that the user supplies.
//
// The extension bundles no word list — every usable one belongs to somebody,
// and the best corpus match for video (SUBTLEX-CH, built from film subtitles)
// states no licence at all. Uploading sidesteps the question entirely: nothing
// is redistributed, because nothing is shipped.
//
// Pure, so every format guess below is testable against the shapes real files
// actually arrive in rather than the shapes their documentation describes.

import type { LanguagePack } from '../lang/pack'

export type ListKind = 'frequency' | 'hsk'

export type ParseError =
  | 'empty'
  /** A zip or spreadsheet — full of Chinese, but not as text. */
  | 'binary'
  /** No column held Chinese. Usually a wrong file; sometimes a wrong encoding. */
  | 'no-chinese'
  /** HSK only: found the words but nothing that looks like a level. */
  | 'no-levels'

export interface Detected {
  format: 'json' | 'delimited' | 'lines'
  delimiter?: string
  headerSkipped: boolean
  wordColumn?: number
  /** Only meaningful for HSK — frequency always ranks by file order. */
  valueColumn?: number
}

export interface ParsedList {
  /** `value` is a rank for a frequency list, or the level for an HSK one. */
  rows: Array<{ headword: string; value: number }>
  detected: Detected
  /** The first few headwords in ranking order, for the confirmation step. */
  sample: string[]
}

export type ParseResult = { ok: true; list: ParsedList } | { ok: false; error: ParseError }

/** How many rows the column sniffing looks at before deciding. */
const SAMPLE_ROWS = 40
const SAMPLE_WORDS = 5

/** HSK has 6 levels in 2.0 and 7-9 bands in 3.0; nothing legitimate falls outside this. */
const MAX_HSK_LEVEL = 9

/** Strips a UTF-8 BOM, which would otherwise ride along inside the first headword. */
function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
}

/**
 * Whether this is a zip, spreadsheet or other binary rather than text.
 *
 * Worth detecting separately: `.xlsx` and the SUBTLEX downloads are zips, and
 * telling someone their spreadsheet "contains no Chinese" when it is entirely
 * Chinese sends them looking in exactly the wrong place.
 */
function looksBinary(text: string): boolean {
  if (text.startsWith('PK')) return true // zip, and therefore xlsx/docx too
  // A NUL in the first stretch means UTF-16 or a true binary; no text file has one.
  return text.slice(0, 1000).includes('\u0000')
}

function cell(raw: string): string {
  // Minimal CSV handling: these files quote rarely, and never with embedded
  // delimiters in the columns we read.
  return raw
    .trim()
    .replace(/^"(.*)"$/s, '$1')
    .trim()
}

/** Keeps the first occurrence, which in a sorted list is also the best rank. */
function dedupe(
  entries: Array<{ headword: string; value: number }>,
): Array<{ headword: string; value: number }> {
  const seen = new Set<string>()
  const rows: Array<{ headword: string; value: number }> = []
  for (const entry of entries) {
    if (seen.has(entry.headword)) continue
    seen.add(entry.headword)
    rows.push(entry)
  }
  return rows
}

/**
 * Numbers a frequency list by position, discarding whatever value was read.
 *
 * A numeric column in these files is sometimes a rank (lower is commoner) and
 * sometimes a count (higher is commoner) — drkameleon gives one, SUBTLEX the
 * other. Reading it the wrong way round would teach the rarest words first
 * while looking entirely plausible. Position says the same thing unambiguously,
 * since every such list is distributed already sorted, and a list that is *not*
 * sorted shows itself immediately in the preview.
 */
function byPosition(
  entries: Array<{ headword: string; value: number }>,
): Array<{ headword: string; value: number }> {
  return entries.map((entry, index) => ({ headword: entry.headword, value: index + 1 }))
}

function finish(
  kind: ListKind,
  entries: Array<{ headword: string; value: number }>,
  detected: Detected,
  pack: LanguagePack,
): ParseResult {
  const deduped = dedupe(
    entries.filter((entry) => entry.headword && pack.containsScript(entry.headword)),
  )
  if (!deduped.length) return { ok: false, error: 'no-chinese' }

  const rows = kind === 'frequency' ? byPosition(deduped) : deduped
  return {
    ok: true,
    list: { rows, detected, sample: rows.slice(0, SAMPLE_WORDS).map((row) => row.headword) },
  }
}

// --- JSON -------------------------------------------------------------------

const WORD_KEYS = ['simplified', 'word', 'headword', 'hanzi', 'chinese', 'character']
const LEVEL_KEYS = ['level', 'hsk', 'hsklevel', 'band']

function keyFor(row: Record<string, unknown>, preferred: string[]): string | null {
  const keys = Object.keys(row)
  for (const name of preferred) {
    const match = keys.find((key) => key.toLowerCase() === name)
    if (match) return match
  }
  return null
}

function parseJson(kind: ListKind, text: string, pack: LanguagePack): ParseResult | null {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return null // not JSON; fall through to the delimited reader
  }
  if (!Array.isArray(value) || !value.length) return null

  const objects = value.filter(
    (row): row is Record<string, unknown> => typeof row === 'object' && row !== null,
  )

  // An array of bare strings is a word list too — the simplest possible export.
  if (!objects.length) {
    const strings = value.filter((row): row is string => typeof row === 'string')
    if (!strings.length) return null
    return finish(
      kind,
      strings.map((headword) => ({ headword: headword.trim(), value: 0 })),
      { format: 'json', headerSkipped: false },
      pack,
    )
  }

  const first = objects[0]
  const wordKey =
    keyFor(first, WORD_KEYS) ??
    Object.keys(first).find(
      (key) => typeof first[key] === 'string' && pack.containsScript(first[key] as string),
    ) ??
    null
  if (!wordKey) return { ok: false, error: 'no-chinese' }

  const levelKey = kind === 'hsk' ? keyFor(first, LEVEL_KEYS) : null
  if (kind === 'hsk' && !levelKey) return { ok: false, error: 'no-levels' }

  const entries: Array<{ headword: string; value: number }> = []
  for (const row of objects) {
    const headword = typeof row[wordKey] === 'string' ? (row[wordKey] as string).trim() : ''
    if (!headword) continue
    if (!levelKey) {
      entries.push({ headword, value: 0 })
      continue
    }
    const level = Number(row[levelKey])
    if (Number.isInteger(level) && level >= 1 && level <= MAX_HSK_LEVEL) {
      entries.push({ headword, value: level })
    }
  }

  if (kind === 'hsk' && !entries.length) return { ok: false, error: 'no-levels' }
  return finish(kind, entries, { format: 'json', headerSkipped: false }, pack)
}

// --- Delimited and plain lines ----------------------------------------------

/** Tab first: every list here that has columns at all uses tabs more often than commas. */
function sniffDelimiter(lines: string[]): string | undefined {
  const sample = lines.slice(0, SAMPLE_ROWS)
  for (const candidate of ['\t', ',']) {
    const withIt = sample.filter((line) => line.includes(candidate)).length
    if (withIt > sample.length / 2) return candidate
  }
  return undefined
}

/**
 * The column holding Chinese in the most rows — not necessarily the first.
 *
 * Most rows rather than any row: an id or pinyin column can carry the odd Han
 * character, and a leading index column is common in exports. Ties go to the
 * leftmost, which is where the word sits in every real file seen so far.
 */
function findWordColumn(rows: string[][], pack: LanguagePack): number | null {
  const width = Math.max(...rows.map((row) => row.length))
  let best: { column: number; hits: number } | null = null

  for (let column = 0; column < width; column++) {
    const hits = rows.filter((row) => row[column] && pack.containsScript(row[column])).length
    if (hits > 0 && (!best || hits > best.hits)) best = { column, hits }
  }
  return best?.column ?? null
}

/** A column of small integers, which for an HSK export is the level. */
function findLevelColumn(rows: string[][], wordColumn: number): number | null {
  const width = Math.max(...rows.map((row) => row.length))
  for (let column = 0; column < width; column++) {
    if (column === wordColumn) continue
    const levels = rows.filter((row) => {
      const value = Number(row[column])
      return Number.isInteger(value) && value >= 1 && value <= MAX_HSK_LEVEL
    }).length
    if (levels > rows.length / 2) return column
  }
  return null
}

function parseDelimited(kind: ListKind, text: string, pack: LanguagePack): ParseResult {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
  if (!lines.length) return { ok: false, error: 'empty' }

  const delimiter = sniffDelimiter(lines)
  const split = (line: string) => (delimiter ? line.split(delimiter).map(cell) : [cell(line)])

  const rows = lines.map(split)
  const sample = rows.slice(0, SAMPLE_ROWS)

  const wordColumn = findWordColumn(sample, pack)
  if (wordColumn === null) return { ok: false, error: 'no-chinese' }

  // A first row whose word column holds no Chinese is a header, not a word.
  const headerSkipped = !pack.containsScript(rows[0][wordColumn] ?? '')
  const body = headerSkipped ? rows.slice(1) : rows

  const detected: Detected = {
    format: delimiter ? 'delimited' : 'lines',
    delimiter,
    headerSkipped,
    wordColumn,
  }

  if (kind === 'frequency') {
    return finish(
      kind,
      body.map((row) => ({ headword: row[wordColumn] ?? '', value: 0 })),
      detected,
      pack,
    )
  }

  const levelColumn = findLevelColumn(body.slice(0, SAMPLE_ROWS), wordColumn)
  if (levelColumn === null) return { ok: false, error: 'no-levels' }

  const entries: Array<{ headword: string; value: number }> = []
  for (const row of body) {
    const level = Number(row[levelColumn])
    if (!Number.isInteger(level) || level < 1 || level > MAX_HSK_LEVEL) continue
    entries.push({ headword: row[wordColumn] ?? '', value: level })
  }

  return finish(kind, entries, { ...detected, valueColumn: levelColumn }, pack)
}

/**
 * Reads an uploaded word list, guessing its shape.
 *
 * Guessing is safe here only because the caller shows what was found before
 * committing it — see the confirmation step in the Data screen. A mis-read
 * column is obvious in five sample words and costs one click to reject.
 */
export function parseWordList(kind: ListKind, raw: string, pack: LanguagePack): ParseResult {
  const text = stripBom(raw)
  if (!text.trim()) return { ok: false, error: 'empty' }
  if (looksBinary(text)) return { ok: false, error: 'binary' }

  return parseJson(kind, text.trim(), pack) ?? parseDelimited(kind, text, pack)
}

/** What to tell the user, in terms of the thing they should actually go and do. */
export function errorMessage(error: ParseError): string {
  switch (error) {
    case 'empty':
      return 'That file is empty.'
    case 'binary':
      return 'That looks like a zip or a spreadsheet. Unzip it first, or open it and save as CSV.'
    case 'no-chinese':
      return 'No Chinese found. Check it is the right file — and if it came from an older dataset, it may not be saved as UTF-8, which would arrive here as garbled text.'
    case 'no-levels':
      return 'Found the words, but no HSK level column (a number from 1 to 9).'
  }
}
