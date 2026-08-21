// What the rest of the extension needs to know about the language it is
// annotating, and nothing about which language that is.
//
// The same shape as `Site` in src/media/site.ts, and for the same reason. The
// overlay orchestrator genuinely runs without naming Bilibili or YouTube; the
// reader, the card renderers and the flashcards app should run without naming
// Chinese. Everything they actually ask — is this character in the script, what
// are the words in this line, what does this headword read as — is a question a
// pack can answer, and every answer to it that they hold themselves is a
// Chinese assumption that compiles cleanly and only fails on a Japanese page.
//
// This module imports no implementation. The registry that does is `packs.ts`.

export interface LanguagePack {
  /** The BCP-47 code the dictionary store, the settings and `DICT_SOURCES` key on. */
  readonly code: string
  /** For log lines and for nothing that branches. */
  readonly name: string
  /**
   * Whether readings carry tone worth colouring.
   *
   * Pinyin does and kana does not, so this is what will hide the tone controls
   * for a language they mean nothing in rather than showing dead switches.
   */
  readonly displaysTones: boolean

  /** Whether this character is one the dictionary could be asked about. */
  inScript(char: string): boolean
  /** Whether there is anything in this text worth looking up at all. */
  containsScript(text: string): boolean
}
