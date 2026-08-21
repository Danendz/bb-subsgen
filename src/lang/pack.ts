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
//
// Two levels, as `Site` → `Video` is two levels: the pack is stateless and
// answers what is true of the language, while `pack.load(raw)` returns a
// `Lexicon` whose methods close over the parsed dictionary. That split is what
// lets a language keep a private index — a deinflection table, a reading map —
// without widening a record every other language would then carry. The
// alternative, a flat pack taking the parsed data on every call, makes that
// data public and leaks each language's internals into a shape everyone
// imports.

/** One cut of a line: a word, or the punctuation and Latin between two of them. */
export interface Token {
  text: string
  pinyin: string | null
}

/** A dictionary word found in running text, with where it sits. */
export interface Match {
  text: string
  /** The reading, or '' when only the characters are known. */
  pinyin: string
  start: number
  /** Exclusive. */
  end: number
}

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

  /**
   * Parses an installed word list into something that can answer questions.
   *
   * `raw` is what `src/dict/store.ts` holds for this language. `load('')` is the
   * empty lexicon: a screen with nothing to segment against is a normal state,
   * not a failure, and it is the same object shape either way.
   */
  load(raw: string): Lexicon
}

/**
 * One language's installed dictionary, and the questions running text asks it.
 *
 * Methods rather than the parsed record, so that what a language keeps in order
 * to answer them stays its own business.
 */
export interface Lexicon {
  /**
   * The pack this was loaded from.
   *
   * Anything holding a lexicon nearly always needs both — "is this one
   * headword" and "is this text in the script" — and a back-reference beats
   * threading two values through every call site that has one of them.
   */
  readonly pack: LanguagePack
  /** Cuts a line into words. */
  segment(text: string): Token[]
  /** The dictionary word covering `index`, or null where there is none. */
  matchAt(text: string, index: number): Match | null
  /** Whether this is exactly one headword — what separates a word from a sentence. */
  has(headword: string): boolean
  /** Headwords matching `query`, best first, excluding what the caller already has. */
  search(query: string, exclude: ReadonlySet<string>, limit: number): string[]
}
