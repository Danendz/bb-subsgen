// The registry of downloadable dictionaries, one entry per language.
//
// A single-entry `Record` today, but the shape a second language (#14) only has
// to extend rather than invent: `lang` is the key the store and the messages
// already use, and `licence`/`attribution` exist because CC-CEDICT's CC BY-SA
// 4.0 requires attribution wherever the derived data is shown or redistributed.
export interface DictSource {
  lang: string
  name: string
  url: string
  licence: string
  attribution: string
}

export const DICT_SOURCES: Record<string, DictSource> = {
  zh: {
    lang: 'zh',
    name: 'CC-CEDICT',
    url: 'https://www.mdbg.net/chinese/export/cedict/cedict_1_0_ts_utf-8_mdbg.txt.gz',
    licence: 'CC BY-SA 4.0',
    attribution: 'Dictionary data from CC-CEDICT, © MDBG, CC BY-SA 4.0.',
  },
}
