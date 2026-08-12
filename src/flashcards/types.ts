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
  /** Video id, when this came from a subtitle. */
  bvid?: string
  /** Cue start in seconds — what the jump-back link rewinds from. */
  start?: number
  /** Page URL, when this came from the reader. */
  url?: string
  /** Video or page title, for display in the app. */
  title?: string
  at: number
}

export type ItemKind = 'word' | 'sentence'

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
  /** Headword for a word; the whole line for a sentence. */
  text: string
  state: ItemState
  /** The word whose discovery captured this sentence — the cloze blank. */
  target?: string
  /** Days. */
  interval: number
  ease: number
  /** Epoch ms. */
  due: number
  reps: number
  lapses: number
  createdAt: number
  /** Every place this was met, most recent last. */
  contexts: Context[]
  /**
   * Frequency rank at capture, denormalised so intake ordering is an index
   * scan rather than a join against `ranks` for every candidate.
   */
  rank?: number
}

/** How a review was asked. Logged so recognition and production can be split later. */
export type ReviewStyle = 'recognise' | 'type' | 'audio' | 'cloze'

/** SM-2 grades, narrowed to the four buttons a review screen actually shows. */
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
}

export interface Exposure {
  headword: string
  count: number
  firstSeen: number
  lastSeen: number
}

/** Per-video exposure, keyed `[bvid, headword]`. */
export interface VideoWord {
  bvid: string
  headword: string
  count: number
}

export interface Video {
  bvid: string
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
  bvid?: string
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
  video?: { bvid: string; title: string; url: string }
  /** Distinct cues seen since the last flush. */
  lines: number
  /** headword → times seen since the last flush. */
  words: Record<string, number>
}

export interface Rank {
  headword: string
  /** 1 = most frequent. Absent when no frequency data has been built. */
  rank?: number
  /** 1-6, or 1-9 for HSK 3.0, depending on the dataset built in. */
  hsk?: number
}

export function wordId(headword: string): string {
  return `w:${headword}`
}

/**
 * Sentences are keyed by their own text rather than by where they came from, so
 * the same line met twice is one card that accumulates two contexts. Lines are
 * capped at 220 characters upstream (`MAX_SENTENCE_LENGTH`), so keys stay bounded.
 */
export function sentenceId(text: string): string {
  return `s:${text.trim()}`
}
