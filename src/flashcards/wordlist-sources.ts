// The registry of downloadable word lists, one entry per language and kind.
//
// The same split as `src/dict/sources.ts`, for the same reason its header
// records: `Data.tsx` imports this only to ask what exists for a language, so a
// reader function hanging off the record would pull every payload format into
// that bundle. The indirection lives in `wordlist-readers.ts` instead.
//
// Downloading rather than explaining how to download is the whole point. What
// used to sit here was a table of four sources, a section on which of SUBTLEX's
// four files is the right one, and a `jq` snippet — a page asking the user to
// do by hand what `src/dict/install.ts` has always done for dictionaries.

import type { ListKind } from './wordlist'

export interface WordListSource {
  /** Stable slug. `wordlist-readers.ts` keys on it, and it is stored in `WordListMeta`. */
  id: string
  lang: string
  kind: ListKind
  /** The dataset's own name, for the attribution line. */
  name: string
  /** The row heading — what this list is, in the language's own terms. */
  label: string
  /** What loading it changes, including what it does not cover. */
  blurb: string
  url: string
  licence: string
  attribution: string
}

// Pinned to a commit rather than `main`: a word list that silently changes
// under an installed deck re-ranks every card without anything saying so, and
// `main` gives the store no version to compare against.
//
// TODO: serve these from our own host. raw.githubusercontent.com is a
// third-party CDN we neither control nor have an uptime promise from, and it
// costs a `host_permissions` entry that nothing else needs.
const HSK30_REF = '7ac65bf1a6387d35f1ade478906172a19311c7f9'
const HSK30_URL = `https://raw.githubusercontent.com/drkameleon/complete-hsk-vocabulary/${HSK30_REF}/complete.min.json`

/** The pinned commit each source was built from, for `WordListMeta.ref`. */
export const SOURCE_REFS: Record<string, string> = {
  'hsk30-frequency': HSK30_REF,
  hsk30: HSK30_REF,
}

const HSK30_ATTRIBUTION =
  'Word list from complete-hsk-vocabulary, © Yanis Zafirópulos, MIT. Frequency data derived from SUBTLEX-CH.'

export const WORD_LIST_SOURCES: Record<string, WordListSource[]> = {
  zh: [
    {
      id: 'hsk30-frequency',
      lang: 'zh',
      kind: 'frequency',
      name: 'complete-hsk-vocabulary',
      label: 'Frequency order',
      // Said plainly because it is a real limitation, not a detail: the dataset
      // is HSK vocabulary, so this ranks ~11,000 exam words by how often they
      // turn up in subtitles. It is not a general frequency list, and a word
      // outside HSK stays unranked — which `newWords()` sorts last.
      blurb:
        'HSK vocabulary ranked by how often it appears in subtitles (SUBTLEX-CH). About 11,000 words; anything outside HSK stays unranked.',
      url: HSK30_URL,
      licence: 'MIT',
      attribution: HSK30_ATTRIBUTION,
    },
    {
      id: 'hsk30',
      lang: 'zh',
      kind: 'hsk',
      name: 'complete-hsk-vocabulary',
      label: 'HSK 3.0 levels',
      // Seven bars, not nine: this dataset collapses HSK 3.0's 7-9 bands into a
      // single band 7, which is how the standard itself publishes them.
      blurb:
        'Groups the dictionary by level, so the deck can be measured a level at a time. Bands 7-9 arrive merged, as HSK 3.0 publishes them.',
      url: HSK30_URL,
      licence: 'MIT',
      attribution: HSK30_ATTRIBUTION,
    },
  ],
}

/** The lists that can be downloaded for a language and kind. Empty is a normal answer. */
export function sourcesFor(lang: string, kind: ListKind): WordListSource[] {
  return (WORD_LIST_SOURCES[lang] ?? []).filter((source) => source.kind === kind)
}
