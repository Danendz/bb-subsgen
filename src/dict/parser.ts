// The shape a downloadable dictionary's format has to fit, so that one
// installer serves more than one of them.
//
// Incremental because the two formats disagree about what a unit of input is.
// CC-CEDICT is one record per line, and the install could read it by splitting
// the stream on '\n'. JMdict is a 63MB XML document whose `<entry>` blocks span
// lines, so a line is not a record and the split the installer used to do
// itself is a CC-CEDICT assumption. `push`/`finish` moves the question of where
// a record ends into the parser, which is the only thing that knows.
//
// Not a `DOMParser` for JMdict, and so not a document-shaped interface either:
// there is no DOM in the `node` suite, so a document parser could only be
// tested by adding jsdom — the smell `.claude/rules/testing.md` names — and a
// fragment parse does not reliably expand JMdict's custom entities anyway.

import type { DictRow } from '../lang/pack'

/**
 * One format, fed the download in whatever chunks the network delivered.
 *
 * `Row` is the language's private row type; the installer holds the parser as
 * `DictParser<DictRow>` and never reads a field. See `zh/cedict-row.ts` for why
 * a row is opaque outside the language that wrote it.
 */
export interface DictParser<Row = DictRow> {
  /** Takes the next piece of decoded text. A record may straddle two chunks. */
  push(chunk: string): void
  /**
   * Everything parsed, keyed by every headword it can be looked up under.
   *
   * A row is shared by reference across its keys rather than copied — JMdict
   * has 465,168 keys over 218,607 entries, and copying would be the difference
   * between an import that fits in memory and one that does not.
   */
  finish(): Map<string, Row[]>
  /**
   * The `headword \t reading [\t flags]` word list, from what `finish` returned.
   *
   * Taken as a parameter rather than read off the parser so that the installer's
   * ordering stays visible in the installer: the map is written to the store
   * first, and the lexicon is built from the same object afterwards.
   */
  lexiconText(byHeadword: Map<string, Row[]>): string
}
