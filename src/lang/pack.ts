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

import type { MessageKey } from '../i18n/keys'

/**
 * One piece of a reading, and the characters it is drawn over.
 *
 * A reading was a string — `'xi3 huan5'` — and Chinese got away with it because
 * `split(' ')` happens to recover the alignment: one syllable, one character.
 * Japanese does not. 食べる reads `taberu`, the furigana belongs over 食 alone,
 * and there is no whitespace in the reading and no rule that puts it back. So
 * the alignment is recorded where it is known rather than reconstructed where
 * it is not.
 *
 * `text` is the **display form** — `xǐ`, not `xi3`. Tone is resolved once, at
 * segment time, by the pack that knows the notation, so that no renderer parses
 * a reading. That is what kept `parseTone` — a fact about CC-CEDICT — living
 * inside two language-neutral drawing routines.
 */
export interface ReadingPart {
  /** The characters this sits over. `''` where the alignment is not known. */
  base: string
  /** What is drawn above them. `''` means nothing is — kana, for #16. */
  text: string
  /** null where the language marks no tone. */
  tone: number | null
}

/** One cut of a line: a word, or the punctuation and Latin between two of them. */
export interface Token {
  text: string
  /**
   * The headword this is a form of. Absent when the surface already is it.
   *
   * Position and identity have come apart, and neither `text` alone can serve
   * both readers. What is drawn, highlighted and measured has to be the surface
   * — a Japanese subtitle that renders 食べる where the video says 食べて is
   * wrong on screen. What is looked up, discovered and filed into the deck has
   * to be the headword, or the deck fills with conjugations and nothing
   * resolves.
   *
   * Not the widening `architecture.md` forbids: that is about one language's
   * *ranking signals* riding on `Entry` and `Tag`. This is the same kind of
   * slot as `ReadingPart.tone`, null "where the language marks no tone", and
   * `Entry.variants`, which only Chinese fills. Chinese never sets it.
   */
  dictionary?: string
  /** null means "not a dictionary word", which is not the same as an empty reading. */
  reading: ReadingPart[] | null
  /**
   * What the segmenter decided this was, set as it cut rather than looked up
   * again by whoever renders it.
   *
   * `'function'` is a word doing grammatical work rather than carrying meaning,
   * which both card renderers dim. `'other'` is the pass-through — punctuation,
   * Latin, digits — and is what tells a renderer there is nothing here to
   * define, without it having to know what the script looks like.
   */
  kind: 'content' | 'function' | 'other'
}

/** A dictionary word found in running text, with where it sits. */
export interface Match {
  text: string
  /** The headword this is a form of. Absent when the surface already is it — see `Token`. */
  dictionary?: string
  /** The reading, or `[]` when only the characters are known. */
  reading: ReadingPart[]
  start: number
  /** Exclusive. */
  end: number
}

/**
 * A structure a sentence is built out of, as the card renderers show it.
 *
 * How a language *recognises* one is deliberately absent: the Chinese matcher
 * anchors on a character and reads its neighbours' readings, which is a shape
 * no other language would share. Its table extends this with the rule it needs
 * — see `ChinesePattern` in `zh/grammar/patterns.ts`.
 */
export interface Pattern {
  /** Stable slug. A grammar card's id derives from this, so it must never move. */
  id: string
  /** What the structure is called, in words that mean something to a learner. */
  name: string
  /** The shape, written out: `V + 得 + ADJ`. */
  skeleton: string
  /** What it does to the meaning. One or two sentences. */
  explanation: string
  /** Roughly where this shows up, for intake ordering. */
  hsk: number
  /** A line this pattern matches, as `text/reading` pairs. */
  example: string
}

export interface PatternMatch {
  pattern: Pattern
  /** First token index the pattern covers. */
  from: number
  /** Last token index the pattern covers, inclusive. */
  to: number
}

/**
 * One stored dictionary record, as it came out of `src/dict/store.ts`.
 *
 * `unknown` on purpose: the store holds whatever the language's install wrote,
 * and only that language's pack knows how to read it. CC-CEDICT's row has
 * `simplified`, `traditional` and a pinyin string; JMdict's has none of the
 * three. Naming either here would put one dictionary's format in the interface
 * every language implements, which is what `Entry` below exists to stop.
 */
export type DictRow = unknown

/**
 * A fact about an entry, or about one of its senses.
 *
 * A union rather than flat strings so a classifier keeps its `ReadingPart[]`
 * and stays tone-coloured where it is drawn. `'cl:个'` would have meant parsing
 * the tag back apart at render time, which is the parsing an `Entry` removes.
 */
export type Tag =
  /** A measure word this entry counts with. Chinese has these; most languages do not. */
  | { kind: 'classifier'; word: string; reading: ReadingPart[] }
  /** Points at another headword — "variant of …", "see …" — and carries no meaning itself. */
  | { kind: 'stub' }
  /** A phrasebook line rather than a lexical unit. See `isPhrase` in zh/entries.ts. */
  | { kind: 'phrase' }
  /** A name. Ranked below ordinary senses, because a surname is rarely what was meant. */
  | { kind: 'proper-noun' }
  /**
   * What kind of thing a sense is: a part of speech, or a usage note.
   *
   * On `Sense.tags` in practice rather than `Entry.tags`, because JMdict's
   * `pos` is per sense. One variant for both because the card cannot usefully
   * draw two chip styles, and `label` is already carried — splitting it later
   * is additive rather than a migration.
   */
  | { kind: 'pos'; label: string }

/** One meaning, in words a learner can read. No dictionary notation survives into `gloss`. */
export interface Sense {
  gloss: string
  tags: Tag[]
}

/**
 * A dictionary entry, in the only terms a renderer needs.
 *
 * Replaces CC-CEDICT's row, which used to travel all the way to the card: a
 * caller held `pinyin` as `'xi3 huan5'`, `definitions` as strings with
 * `CL:個|个[ge4]` still in them, and `simplified` / `traditional` as fields that
 * are a Chinese assumption compiling cleanly on a Japanese page. Everything
 * that turned a row into something drawable now happens in `entriesFrom`,
 * behind the pack that owns the format.
 */
export interface Entry {
  headword: string
  /** Other spellings of the same word. Chinese puts the traditional form here. */
  variants: string[]
  reading: ReadingPart[]
  senses: Sense[]
  /**
   * Facts about the whole entry rather than about one sense.
   *
   * Separate from `Sense.tags` because some are genuinely entry-wide: a proper
   * noun is one by its reading, not by any sense, and an entry can rank without
   * having a single usable sense left to hang the tag on.
   */
  tags: Tag[]
}

/**
 * A capability a language is going to get and has not got yet.
 *
 * Named states rather than free text so that the badge, its tooltip and the
 * settings row it sits on all come out of one table (`src/lang/gaps.ts`), and
 * so that shipping one of them is a compile error at every place that lists it.
 */
export type Gap = 'patterns' | 'onDeviceTranslation'

export interface LanguagePack {
  /** The BCP-47 code the dictionary store, the settings and `DICT_SOURCES` key on. */
  readonly code: string
  /** The language's name in English, for log lines and anything else no one reads in Spanish. */
  readonly name: string
  /**
   * The same name in the locale table, for prose the user reads.
   *
   * A field rather than a lookup keyed on `code` because `code` is a `string`:
   * a table would answer `undefined` for a language that forgot its entry and
   * only show up as a blank in the middle of a sentence, where this is a
   * compile error the moment a pack is added. `name` stays for the callers that
   * are not prose — log lines, and the sources registry.
   */
  readonly nameKey: MessageKey
  /**
   * What this language's standard proficiency scale is called — 'HSK', 'JLPT'.
   *
   * Here rather than in the Data tab because the alternative is a switch on
   * `code` in a component, which is the Chinese assumption that compiles
   * cleanly and only shows up as an 'HSK levels' row on a Japanese deck. The
   * stored field is still named `hsk` and stays that way; this is the label.
   */
  readonly levelsName: string
  /**
   * Whether readings carry tone worth colouring.
   *
   * Pinyin does and kana does not, so this hides the "Tone colors" switch in
   * Settings › Language for a language it means nothing in rather than showing
   * a dead control.
   */
  readonly displaysTones: boolean
  /**
   * Whether the script has a second form the reader can be shown instead.
   *
   * Gates "Show traditional in definitions" in Settings › Language. Chinese has
   * traditional and simplified; Japanese has one written form and nothing to
   * choose between, so the row is hidden rather than disabled — a control that
   * can never apply is not a control.
   */
  readonly usesTraditional: boolean
  /**
   * A line for the "Test voice" button to say, or `''` if there is nothing to
   * speak this language with.
   *
   * Here rather than in the settings component because the alternative is a
   * hardcoded Chinese sentence, which is what this replaces — a Japanese-only
   * learner pressed Test voice and heard 你好，今天天气很好。
   */
  readonly speechSample: string
  /**
   * The BCP-47 tag a voice has to speak for this language's cards.
   *
   * What `listVoices` filters the picker by and what `pickVoice` selects
   * against, so the voice chosen in Settings is one that can read the deck.
   */
  readonly voiceLang: string
  /**
   * What this language is going to have and does not have yet.
   *
   * Read by the "Coming soon" badge in Settings and on the wizard's language
   * card, so a language that is half-built says so instead of reading as
   * finished. Only for work that is actually planned: something a language will
   * never have is hidden by the flags above, because a badge on it would be a
   * promise nobody intends to keep. That is also why this is a list here rather
   * than derived from `patterns` being empty — `findPatterns` documents an
   * empty table as a valid answer, not as a gap.
   */
  readonly comingSoon: readonly Gap[]

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

  /** The sentence around `index`, trimmed. Empty when there is nothing to translate. */
  sentenceTextAt(text: string, index: number): string

  /**
   * Every headword one card's lookup needs, for a single batched round trip.
   *
   * The word plus the pieces it is written with, which is not always its
   * characters — a language whose script is one unit per word answers with the
   * word alone, and so does Chinese for a single character.
   */
  cardHeadwords(headword: string): string[]

  /**
   * Every structure this line contains, ordered by where it starts.
   *
   * `[]` is a valid answer, and not only when a line has none: a language with
   * no pattern table at all is a normal case, not a gap to fill in later.
   */
  findPatterns(tokens: Token[]): PatternMatch[]
  /** The patterns one word takes part in — what the hover card explains. */
  patternsForWord(tokens: Token[], word: string): Pattern[]
  /** Resolves a stored grammar card's pattern id, or undefined if the table dropped it. */
  patternById(id: string): Pattern | undefined
  readonly patterns: readonly Pattern[]

  /**
   * Turns stored rows into entries anyone can render.
   *
   * The one place a dictionary's own notation is read. Everything a row needs
   * doing to it — picking a reading apart, lifting measure words out of the
   * gloss text, rewriting cross-references into something printable — happens
   * here, so that no caller downstream holds a format.
   *
   * `traditional` is a display choice, and it reaches this rather than being
   * baked in at install time because it can change between two hovers. Rows a
   * pack does not recognise are dropped: `DictRow` is `unknown`, and a stale
   * install is a card with no definition, never a thrown renderer.
   */
  entriesFrom(rows: DictRow[], headword: string, opts: { traditional: boolean }): Entry[]

  /**
   * Orders entries so the most useful sense comes first.
   *
   * `displayedReading` is the **display form** already on screen — what
   * `readingText` returns, not a dictionary's raw notation. It is the strongest
   * signal there is, and the only reading a caller holding a `Token` still has.
   *
   * One ranking per language, shared by every caller: the hover card, the
   * glossary handed to the model, and the reading the install picks per
   * headword all have to agree on which sense a word has, or the model is told
   * about a sense the learner was never shown.
   */
  rank(entries: Entry[], headword: string, displayedReading?: string): Entry[]
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
