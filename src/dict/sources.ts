// The registry of downloadable dictionaries, one entry per language.
//
// `lang` is the key the store, the settings and the messages already use, and
// `licence`/`attribution` exist because both dictionaries here are CC BY-SA 4.0,
// which requires attribution wherever the derived data is shown or
// redistributed. Which parser reads a source is deliberately not a field on it —
// see `parsers.ts` for why.
export interface DictSource {
  lang: string
  /**
   * The language you study — what the picker asks about.
   *
   * Split from `name` because they are not the same answer: "What are you
   * studying?" is answered with "Chinese", not with "CC-CEDICT".
   */
  langName: string
  /** The dictionary's own name, for the install card and its attribution. */
  name: string
  url: string
  licence: string
  attribution: string
}

export const DICT_SOURCES: Record<string, DictSource> = {
  zh: {
    lang: 'zh',
    langName: 'Chinese',
    name: 'CC-CEDICT',
    url: 'https://www.mdbg.net/chinese/export/cedict/cedict_1_0_ts_utf-8_mdbg.txt.gz',
    licence: 'CC BY-SA 4.0',
    attribution: 'Dictionary data from CC-CEDICT, © MDBG, CC BY-SA 4.0.',
  },
  ja: {
    lang: 'ja',
    langName: 'Japanese',
    name: 'JMdict',
    // `www.edrdg.org`, not the `ftp.edrdg.org` path the file is usually quoted
    // as: that host serves a certificate that does not match the name, and
    // plain http from a `chrome-extension://` page is blocked as mixed content.
    // This host serves the same bytes and sends `Last-Modified`, so the
    // wizard's "check for update" HEAD works against it unchanged.
    url: 'https://www.edrdg.org/pub/Nihongo/JMdict_e.gz',
    licence: 'CC BY-SA 4.0',
    attribution:
      'Dictionary data from JMdict, © Electronic Dictionary Research and Development Group, CC BY-SA 4.0.',
  },
}

/**
 * The languages there is actually something to switch between.
 *
 * Both halves matter: enabled without installed is a language the wizard was
 * told about but never downloaded, and switching to it would leave every lookup
 * empty. Ordered by `enabled` rather than by the registry, so the control lists
 * languages in the order you chose them.
 */
export function installedSources(enabled: string[], installed: ReadonlySet<string>): DictSource[] {
  return enabled
    .filter((lang) => installed.has(lang))
    .map((lang) => DICT_SOURCES[lang])
    .filter((source): source is DictSource => source !== undefined)
}
