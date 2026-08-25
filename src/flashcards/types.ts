// The flashcards data model, shared by the worker, the content scripts and the
// study app. Kept free of DOM and IndexedDB so it can be imported anywhere.

/**
 * Where a word or sentence was met, snapshotted at capture time.
 *
 * Snapshotted rather than referenced: a video can be deleted or region-locked
 * and a page can change, but a card has to keep working. The translation is
 * frozen for the same reason — Chrome's Translator API is unavailable on some
 * platforms, and a card that can't render its own answer is worthless.
 */
export interface Context {
  /** The sentence or subtitle line, as it appeared. */
  text: string
  /** Translation as it stood when captured; empty when none was available. */
  translation: string
  /** Video id, when this came from a subtitle. See `VideoId`. */
  videoId?: string
  /**
   * Where the Chinese came from: a published subtitle track, or a transcript of
   * the audio.
   *
   * Recorded because the two are not equally trustworthy. A track is the text the
   * publisher wrote; a transcript is a speech model's best guess, and Mandarin is
   * dense with homophones — 在 for 再, the wrong 的, a surname invented whole. A
   * card built from a misheard line teaches a word that was never said, and
   * without this there is no way to find those again, or to judge how often it
   * happens.
   *
   * Optional because every card captured before transcription existed came from
   * a track, and `undefined` says "unrecorded" rather than pretending otherwise.
   */
  source?: 'cc' | 'asr'
  /** Cue start in seconds — what the jump-back link rewinds from. */
  start?: number
  /** Page URL, when this came from the reader. */
  url?: string
  /** Video or page title, for display in the app. */
  title?: string
  at: number
}

export type ItemKind = 'word' | 'sentence' | 'grammar'

/**
 * `pool` is the intake holding area: captured, but not yet introduced. Every
 * other state is ordinary SM-2, plus `known` for words you declared you already
 * knew, which are never scheduled.
 */
export type ItemState = 'pool' | 'new' | 'learning' | 'review' | 'known'

export interface Item {
  /** Deterministic — see `wordId` / `sentenceId`. Two browsers derive the same id. */
  id: string
  kind: ItemKind
  /**
   * Which language this card is in — `pack.code`.
   *
   * Duplicates the segment the id already carries, exactly as `kind` duplicates
   * the `w:` / `s:` / `g:` prefix. The id is an opaque unique key that nothing
   * parses; a query that needs to know the language reads this field instead, so
   * "cards in the language I am studying" never becomes a string split.
   *
   * Plain `string`, not a union: `pack.code` and `settings.studyLang` are both
   * `string`, and a `LangCode` union would have to be kept in step with a
   * registry that is deliberately open.
   */
  lang: string
  /** Headword for a word; the whole line for a sentence; the skeleton for a pattern. */
  text: string
  /**
   * Which grammar pattern this card is, for a `grammar` item.
   *
   * Kept separate from `text` because `text` is also what gets segmented and
   * rendered, and a skeleton like `V + 得 + how` is not a sentence. This is the
   * join back to `PATTERNS`, and the id is derived from it — see `grammarId`.
   */
  patternId?: string
  state: ItemState
  /** The word whose discovery captured this sentence — the cloze blank. */
  target?: string
  /** Days. */
  interval: number
  /**
   * Rung on the mastery ladder, 0-6. See `LADDER` in scheduler.ts.
   *
   * Optional because cards written before the ladder existed do not have one;
   * `levelOf` derives it from the interval they already earned, so no migration
   * is needed and the value is persisted on the card's next review.
   */
  level?: number
  /**
   * SM-2 ease, no longer read by the scheduler.
   *
   * Kept on the record so exports written by older versions stay readable and so
   * a future scheduler could use it again. The ladder has no use for it.
   */
  ease: number
  /** Epoch ms. */
  due: number
  reps: number
  lapses: number
  createdAt: number
  /**
   * When this was first reviewed.
   *
   * Introduction is the moment a card is first served, not a separate promotion
   * step — so this doubles as the record of *when* and as the flag for whether
   * it has been introduced at all. Daily intake limits count these rather than
   * a separate counter, which means the limits survive an import unchanged.
   */
  introducedAt?: number
  /** Every place this was met, most recent last. */
  contexts: Context[]
}

/** How a review was asked. Logged so recognition and production can be split later. */
export type ReviewStyle = 'recognise' | 'type' | 'audio' | 'cloze'

/**
 * What the study session asks of you.
 *
 * `mixed` is not a fourth kind of question — it rotates the other three off the
 * card's review count, so a word is met from a different angle each sitting
 * rather than the same one three times running.
 */
export type StudyMode = 'remember' | 'type' | 'audio' | 'mixed'

/** Which cards a session draws from. `both` means everything, grammar included. */
export type StudyInclude = 'words' | 'sentences' | 'grammar' | 'both'

/**
 * How a review went.
 *
 * The screen offers two answers and only ever logs `again` or `good`. `hard` and
 * `easy` are retained because the log is append-only and still holds rows from
 * the four-button era — replaying that history has to keep meaning something.
 */
export type Grade = 'again' | 'hard' | 'good' | 'easy'

/**
 * One review, appended and never modified.
 *
 * The log is the source of truth rather than the item's current interval: it
 * makes the scheduler swappable without a migration, and it is what lets two
 * exported histories merge by replay instead of one overwriting the other.
 */
export interface Review {
  itemId: string
  at: number
  grade: Grade
  style: ReviewStyle
  intervalBefore: number
  intervalAfter: number
  /**
   * Practice drawn from outside the schedule — see `practice` in queue.ts.
   *
   * A correct one only counts as the card having been *asked*: answering early
   * shows you know it now, which is not the claim the interval was making.
   * Getting it wrong is different, and is treated as an ordinary lapse, because
   * failing a card early is real evidence the interval was too long.
   *
   * Optional so every row written before practice existed stays valid and is
   * read as a scheduled review, which is what it was.
   */
  extra?: boolean
}

export interface Exposure {
  /** Keyed `[lang, headword]` since schema 4 — 生 is two words, not one. */
  lang: string
  headword: string
  count: number
  firstSeen: number
  lastSeen: number
}

/** Per-video exposure, keyed `[videoId, lang, headword]`. */
export interface VideoWord {
  videoId: string
  lang: string
  headword: string
  count: number
}

export interface Video {
  videoId: string
  title: string
  url: string
  firstWatched: number
  lastWatched: number
  /** Distinct cues seen, not cues in the track. */
  lines: number
}

/**
 * A raw dwell sample, stored so the struggle-capture threshold can be set from
 * the real distribution rather than guessed. Small: one row per line engaged with.
 */
export interface Signal {
  at: number
  videoId?: string
  /** Cue start, identifying the line. */
  start?: number
  /** Milliseconds of engagement. Playback is paused throughout, so this is real time. */
  ms: number
  /** Whether the line's aids were hidden because every word was known. */
  hidden: boolean
  captured: boolean
}

/**
 * A flush of exposures from one content script.
 *
 * Batched rather than written per line: a 30-minute video is roughly 3,000 word
 * instances, and content scripts cannot write to the store directly anyway.
 */
export interface ExposureBatch {
  video?: { videoId: string; title: string; url: string }
  /** Distinct cues seen since the last flush. */
  lines: number
  /** headword → times seen since the last flush. */
  words: Record<string, number>
}

export interface Rank {
  /**
   * Which language's list this row came from, keyed `[lang, headword]`.
   *
   * Without it an uploaded Japanese frequency list and an uploaded HSK list are
   * the same table, and 生 gets whichever rank was written last.
   */
  lang: string
  headword: string
  /** 1 = most frequent. Absent when no frequency data has been built. */
  rank?: number
  /** 1-6, or 1-9 for HSK 3.0, depending on the dataset built in. */
  hsk?: number
}

/**
 * Ids carry their language, because a headword alone is ambiguous.
 *
 * Chinese 生 and Japanese 生 are the same string and different words, with
 * different readings, different meanings and separate review histories. Before
 * schema 4 they were one card sharing an exposure count and an HSK rank.
 *
 * Nothing in `src/` parses an id — no `startsWith('w:')`, no split — and nothing
 * should start. The language segment makes the key unique; `Item.lang` is what
 * anything asking a question about the language reads.
 */
export function wordId(lang: string, headword: string): string {
  return `w:${lang}:${headword}`
}

/**
 * Sentences are keyed by their own text rather than by where they came from, so
 * the same line met twice is one card that accumulates two contexts. Lines are
 * capped at 220 characters upstream (`MAX_SENTENCE_LENGTH`), so keys stay bounded.
 */
export function sentenceId(lang: string, text: string): string {
  return `s:${lang}:${text.trim()}`
}

/**
 * Patterns are keyed by their own id, so one card accumulates every line you
 * have met the structure in — which is exactly the example set the card needs to
 * quiz with. This is why `Pattern.id` must never move: it carries the card's
 * whole review history.
 */
export function grammarId(lang: string, patternId: string): string {
  return `g:${lang}:${patternId}`
}

/**
 * Lifts an id written before ids carried a language.
 *
 * The prefix and its separator are already there, and the language segment goes
 * in the same place for all three kinds — so this inserts rather than parses.
 * Splitting on `:` would be wrong for a sentence id, whose text may contain one.
 *
 * Used by the schema-4 database migration and by the version-3 backup lift, which
 * have to agree exactly: the review log points at cards by id, and an id derived
 * two different ways is a card whose history has been orphaned.
 */
export function namespaceLegacyId(lang: string, id: string): string {
  return `${id.slice(0, 2)}${lang}:${id.slice(2)}`
}
