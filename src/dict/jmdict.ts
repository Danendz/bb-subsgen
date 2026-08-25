// JMdict parsing, streamed, hand-rolled, and strings all the way down.
//
// JMdict_e is a 63MB XML document of 218,607 `<entry>` blocks against an
// internal DTD. Three decisions, each of which had an obvious alternative:
//
// - **No `DOMParser`.** There is none in the `node` suite, so a document parser
//   could only be tested by adding jsdom — the smell `.claude/rules/testing.md`
//   names — and a fragment parse does not reliably expand the DTD's custom
//   entities anyway, which is where every part-of-speech code lives.
// - **Entity refs are the tag.** JMdict writes part of speech as `&n;`, `&v5r;`,
//   `&adj-i;`. Stripping the `&` and the `;` yields exactly the short codes
//   jmdict-simplified publishes, so no entity table is needed and none is
//   shipped. Only the five predefined XML entities are unescaped, and only in
//   gloss text, where they are the only ones that appear.
// - **Cut on `</entry>`, not on a line.** An entry spans lines and a line is not
//   a record, which is the whole reason `DictParser` is push/finish rather than
//   a line callback.
//
// JMdict is CC BY-SA 4.0, © the Electronic Dictionary Research and Development
// Group. Attribution required wherever this derived data is shown or
// redistributed.

import { lexiconFacts } from '../lang/ja/entries'
import type { JmdictKana, JmdictKanji, JmdictRow, JmdictSense } from '../lang/ja/jmdict-row'
import type { DictParser } from './parser'

const ENTRY_CLOSE = '</entry>'

// One compiled regex per element, reused across every entry: `matchAll` works
// on a copy, so a shared global regex carries no `lastIndex` between calls.
const K_ELE = /<k_ele>([\s\S]*?)<\/k_ele>/g
const R_ELE = /<r_ele>([\s\S]*?)<\/r_ele>/g
const SENSE = /<sense>([\s\S]*?)<\/sense>/g

const KEB = /<keb>([^<]*)<\/keb>/g
const KE_INF = /<ke_inf>([^<]*)<\/ke_inf>/g
const KE_PRI = /<ke_pri>([^<]*)<\/ke_pri>/g
const REB = /<reb>([^<]*)<\/reb>/g
const RE_INF = /<re_inf>([^<]*)<\/re_inf>/g
const RE_PRI = /<re_pri>([^<]*)<\/re_pri>/g
const RE_RESTR = /<re_restr>([^<]*)<\/re_restr>/g
const RE_NOKANJI = /<re_nokanji\s*\/?>/
const POS = /<pos>([^<]*)<\/pos>/g
const MISC = /<misc>([^<]*)<\/misc>/g
const FIELD = /<field>([^<]*)<\/field>/g
const S_INF = /<s_inf>([^<]*)<\/s_inf>/g
// Attributes are real here: `<gloss g_type="lit">`, and in JMdict_e also
// `xml:lang`, which the English extract carries on nothing but is cheap to allow.
const GLOSS = /<gloss[^>]*>([^<]*)<\/gloss>/g

/**
 * The priority bands that mean "this is the ordinary way to write the word".
 *
 * jmdict-simplified's rule, adopted rather than invented so that anyone
 * comparing this dictionary against that one sees the same words called common.
 * The `2` bands — `news2`, `ichi2` — are explicitly the less-common halves of
 * their lists and are deliberately not here.
 */
const COMMON_PRIORITIES: ReadonlySet<string> = new Set(['ichi1', 'news1', 'spec1', 'spec2', 'gai1'])

function textsOf(block: string, pattern: RegExp): string[] {
  return Array.from(block.matchAll(pattern), (match) => match[1])
}

/** `&adj-i;` → `adj-i`. Anything that is not an entity ref is left alone. */
function codesOf(block: string, pattern: RegExp): string[] {
  return textsOf(block, pattern).map((raw) => {
    const match = /^&(.+);$/.exec(raw.trim())
    return match ? match[1] : raw.trim()
  })
}

/**
 * The five predefined XML entities, in gloss text only.
 *
 * `&amp;` last would double-unescape `&amp;lt;` into `<`; first is the only
 * order that does not.
 */
function unescapeXml(text: string): string {
  return text
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&amp;', '&')
}

function isCommon(priorities: string[]): boolean {
  return priorities.some((priority) => COMMON_PRIORITIES.has(priority))
}

function kanjiOf(entry: string): JmdictKanji[] {
  const out: JmdictKanji[] = []
  for (const [, block] of entry.matchAll(K_ELE)) {
    const [text] = textsOf(block, KEB)
    if (!text) continue
    out.push({ text, common: isCommon(textsOf(block, KE_PRI)), tags: codesOf(block, KE_INF) })
  }
  return out
}

function kanaOf(entry: string): JmdictKana[] {
  const out: JmdictKana[] = []
  for (const [, block] of entry.matchAll(R_ELE)) {
    const [text] = textsOf(block, REB)
    if (!text) continue
    out.push({
      text,
      common: isCommon(textsOf(block, RE_PRI)),
      tags: codesOf(block, RE_INF),
      restrictedTo: textsOf(block, RE_RESTR),
      nokanji: RE_NOKANJI.test(block),
    })
  }
  return out
}

function sensesOf(entry: string): JmdictSense[] {
  const out: JmdictSense[] = []
  for (const [, block] of entry.matchAll(SENSE)) {
    out.push({
      pos: codesOf(block, POS),
      misc: codesOf(block, MISC),
      field: codesOf(block, FIELD),
      info: textsOf(block, S_INF).map(unescapeXml),
      gloss: textsOf(block, GLOSS).map(unescapeXml),
    })
  }
  return out
}

/** Null for a block with nothing to look up — which the DTD preamble is. */
export function parseJmdictEntry(block: string): JmdictRow | null {
  const start = block.indexOf('<entry>')
  if (start < 0) return null
  const entry = block.slice(start)

  const row: JmdictRow = {
    kanji: kanjiOf(entry),
    kana: kanaOf(entry),
    senses: sensesOf(entry),
  }
  if (!row.kanji.length && !row.kana.length) return null
  return row
}

/**
 * Every headword one row can be looked up under: each spelling and each reading.
 *
 * Both, not just the spellings. 41,195 of JMdict's entries are kana-only and
 * have no spelling at all, and a learner hovering ください on a page is hovering
 * a reading. Together they come to 465,168 keys over 218,607 entries — the row
 * is shared by reference across its keys rather than copied, which is the
 * difference between an import that fits in memory and one that does not.
 */
export function headwordsOf(row: JmdictRow): string[] {
  return [...row.kanji.map((kanji) => kanji.text), ...row.kana.map((kana) => kana.text)]
}

export function jmdictParser(): DictParser<JmdictRow> {
  const byHeadword = new Map<string, JmdictRow[]>()
  let buffer = ''

  const take = (block: string) => {
    const row = parseJmdictEntry(block)
    if (!row) return
    for (const headword of new Set(headwordsOf(row))) {
      const existing = byHeadword.get(headword)
      if (existing) existing.push(row)
      else byHeadword.set(headword, [row])
    }
  }

  return {
    push(chunk) {
      buffer += chunk
      for (;;) {
        const end = buffer.indexOf(ENTRY_CLOSE)
        if (end < 0) break
        take(buffer.slice(0, end))
        buffer = buffer.slice(end + ENTRY_CLOSE.length)
      }
    },
    finish() {
      // A well-formed file ends with `</JMdict>` and nothing unterminated, so
      // what is left is whitespace. Parsed anyway rather than dropped: a
      // truncated download should lose its last entry, not silently lose it and
      // any it was buffered behind.
      take(buffer)
      buffer = ''
      return byHeadword
    },
    lexiconText(map) {
      const lines: string[] = []
      for (const [headword, rows] of map) {
        // The install and the hover card have to agree on which sense a word
        // has, so the reading is the one the ranking picks — see `lexiconFacts`.
        const { reading, flags } = lexiconFacts(rows, headword)
        lines.push(`${headword}\t${reading}${flags.length ? `\t${flags.join(',')}` : ''}`)
      }
      return lines.join('\n')
    },
  }
}
