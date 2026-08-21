import type { AudioSource } from '../media/audio-source'
import type { Cue } from '../media/cue'
import type { CedictEntry } from '../dict/cedict'
import type { Context, ExposureBatch, Signal } from '../flashcards/types'
import type { VideoPreamble } from '../llm/batch'
import type { PassCue, PassStatus } from '../background/llm-translate'
import type { TranscriptStatus } from '../background/asr-pass'
import type { TranslationLang } from './settings'

/** `'no-dictionary'` is a tab whose enabled language has no dictionary installed. */
export type Status = 'loading' | 'no-track' | 'active' | 'no-dictionary'

export interface GetStatusMessage {
  type: 'bb-subsgen:get-status'
}

export interface StatusResponse {
  status: Status
}

export function isGetStatusMessage(msg: unknown): msg is GetStatusMessage {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    (msg as { type?: unknown }).type === 'bb-subsgen:get-status'
  )
}

/**
 * Asks the worker how far the translation pass for a tab has got.
 *
 * Deliberately not part of `LlmMessage`: everything in that union is
 * fire-and-forget, for the documented reason that a pass takes tens of minutes
 * and nothing a reply could say would be worth waiting for. This one is only
 * ever a reply, so it gets its own pair rather than quietly falsifying that.
 *
 * The tab id is carried explicitly because the popup is not a content script —
 * `sender.tab` is undefined for it, so the worker cannot infer which tab is
 * being asked about.
 */
export interface GetPassStatusMessage {
  type: 'bb-subsgen:llm-pass-status'
  tabId: number
}

export interface PassStatusResponse {
  /** Null when no pass is running for that tab. */
  status: PassStatus | null
}

export function isGetPassStatusMessage(msg: unknown): msg is GetPassStatusMessage {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    (msg as { type?: unknown }).type === 'bb-subsgen:llm-pass-status' &&
    typeof (msg as { tabId?: unknown }).tabId === 'number'
  )
}

/** The same question about the transcription. See `transcriptStatus`. */
export interface GetTranscriptStatusMessage {
  type: 'bb-subsgen:asr-status'
  tabId: number
}

export interface TranscriptStatusResponse {
  /** Null when this tab has no run and nothing left over from one. */
  status: TranscriptStatus | null
}

export function isGetTranscriptStatusMessage(msg: unknown): msg is GetTranscriptStatusMessage {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    (msg as { type?: unknown }).type === 'bb-subsgen:asr-status' &&
    typeof (msg as { tabId?: unknown }).tabId === 'number'
  )
}

/**
 * Asks the service worker for dictionary entries.
 *
 * Batched by design — see `lookupDefsIn` in src/dict/store.ts. The definition
 * store lives in the worker because content scripts would otherwise each import
 * it under their own page origin.
 */
export interface LookupDefsMessage {
  type: 'bb-subsgen:lookup-defs'
  /**
   * Which language's definitions to answer with.
   *
   * On the message rather than resolved in the worker because `defs` is keyed
   * `${lang}:${headword}` since schema 2, so there is no answer without one —
   * and the sender is the only party that knows which language the text it is
   * annotating is in.
   */
  lang: string
  headwords: string[]
}

export interface LookupDefsResponse {
  entries: Record<string, CedictEntry[]>
}

export function isLookupDefsMessage(msg: unknown): msg is LookupDefsMessage {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    (msg as { type?: unknown }).type === 'bb-subsgen:lookup-defs' &&
    typeof (msg as { lang?: unknown }).lang === 'string' &&
    Array.isArray((msg as { headwords?: unknown }).headwords)
  )
}

/**
 * Everything a content script asks the worker to write.
 *
 * One union with one guard rather than a message type and predicate each: these
 * are all fire-and-forget writes with the same handling, and the worker's
 * dispatch reads better as a single switch. Nothing here expects a response —
 * a dropped capture is not worth blocking a hover on.
 */
export type FlashcardsMessage =
  | { type: 'bb-subsgen:record-exposures'; batch: ExposureBatch }
  | { type: 'bb-subsgen:discover-word'; headword: string; context?: Context }
  | {
      type: 'bb-subsgen:capture-sentence'
      text: string
      context: Context
      target?: string
      /**
       * Unknown words in the line, pooled alongside it.
       *
       * Carried on this message rather than sent as a `discover-word` each is
       * what keeps capture affordable: a subtitle line changes every few seconds
       * and holds a handful of unknown words, so per-word messages would be
       * roughly one round trip and one transaction per second for the length of
       * a video — the cost `createExposureBuffer` exists to avoid.
       */
      words?: string[]
      /**
       * Grammar patterns the line was built out of, pooled alongside it.
       *
       * Rides this message for the same reason `words` does, and lands in the
       * same transaction — a pattern is only ever met *in* a line, so a line
       * arriving without the structure it taught would be a half-written fact.
       */
      patterns?: string[]
    }
  | { type: 'bb-subsgen:mark-known'; headword: string; known: boolean }
  | { type: 'bb-subsgen:record-signal'; signal: Signal }

const FLASHCARDS_TYPES = new Set<string>([
  'bb-subsgen:record-exposures',
  'bb-subsgen:discover-word',
  'bb-subsgen:capture-sentence',
  'bb-subsgen:mark-known',
  'bb-subsgen:record-signal',
])

export function isFlashcardsMessage(msg: unknown): msg is FlashcardsMessage {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    typeof (msg as { type?: unknown }).type === 'string' &&
    FLASHCARDS_TYPES.has((msg as { type: string }).type)
  )
}

/**
 * The background translation pass, in both directions.
 *
 * Also fire-and-forget, and for a stronger reason than the flashcards union:
 * the pass takes tens of minutes, so there is nothing a reply could usefully
 * say. Results come back the other way as `llm-translations`, batch by batch.
 */
export type LlmMessage =
  | {
      type: 'bb-subsgen:llm-translate-track'
      videoId: string
      lang: TranslationLang
      model: string
      baseUrl: string
      video?: VideoPreamble
      cues: PassCue[]
    }
  /** Where playback is now, so the pass can re-order what is left. */
  | { type: 'bb-subsgen:llm-playhead'; index: number }
  | { type: 'bb-subsgen:llm-cancel' }
  /**
   * A chat is generating, or has stopped.
   *
   * Sent by the app page and the drawer rather than a content script: one GPU,
   * and an explanation you are waiting for should not queue behind a batch of
   * subtitles you are not.
   */
  | { type: 'bb-subsgen:llm-busy'; busy: boolean }

const LLM_TYPES = new Set<string>([
  'bb-subsgen:llm-translate-track',
  'bb-subsgen:llm-playhead',
  'bb-subsgen:llm-cancel',
  'bb-subsgen:llm-busy',
])

export function isLlmMessage(msg: unknown): msg is LlmMessage {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    typeof (msg as { type?: unknown }).type === 'string' &&
    LLM_TYPES.has((msg as { type: string }).type)
  )
}

/**
 * Transcription, asked for by a content script that found no subtitle track.
 *
 * Fire-and-forget like the translation pass, and for the same reason: this takes
 * minutes, and the results come back as `asr-cues` rather than as a reply. The
 * worker is asked rather than the offscreen document directly because a content
 * script may not create one, and because the worker owns the transcript cache
 * that usually makes the whole request unnecessary.
 */
export type AsrMessage =
  | {
      type: 'bb-subsgen:asr-transcribe'
      videoId: string
      /**
       * Where the audio is, resolved by the content script before asking.
       *
       * The sender is the only party that knows what site it is on, so it is the
       * only one that can answer this. Sending the answer rather than the
       * question is what keeps the worker and the offscreen document free of
       * per-site API calls.
       */
      audio: AudioSource
      model: string
      baseUrl: string
      /** Seconds; decides which chunk is transcribed first. */
      playhead: number
    }
  | { type: 'bb-subsgen:asr-cancel' }
  /**
   * Playback jumped, so what is left should be re-ordered around it.
   *
   * The sibling of `llm-playhead`, in seconds rather than in cue indices,
   * because during transcription there are barely any cues to index.
   */
  | { type: 'bb-subsgen:asr-playhead'; seconds: number }
  /**
   * Ask again for whatever a run could not transcribe.
   *
   * `tabId` because this comes from the popup as well as from the overlay, and
   * the popup has no tab of its own; the worker falls back to the sender's.
   */
  | { type: 'bb-subsgen:asr-retry'; tabId?: number }

const ASR_TYPES = new Set<string>([
  'bb-subsgen:asr-transcribe',
  'bb-subsgen:asr-cancel',
  'bb-subsgen:asr-playhead',
  'bb-subsgen:asr-retry',
])

export function isAsrMessage(msg: unknown): msg is AsrMessage {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    typeof (msg as { type?: unknown }).type === 'string' &&
    ASR_TYPES.has((msg as { type: string }).type)
  )
}

/**
 * Cues so far, sent as each chunk lands and once more at the end.
 *
 * Always the whole track rather than the newest chunk: chunks are transcribed
 * playhead-first, so they finish out of order, and everything downstream indexes
 * cues by position. Re-sending a sorted list costs a few hundred kilobytes over
 * an episode and removes a whole class of splicing bug.
 */
export interface AsrCuesMessage {
  type: 'bb-subsgen:asr-cues'
  videoId: string
  cues: Cue[]
  /** Chunks finished, and expected. What the progress pill counts. */
  done: number
  total: number
  /**
   * The stretches of track transcribed so far, as `[start, end]` in seconds.
   *
   * What decides whether the pill is showing: the run is only worth reporting
   * while the part being watched is not in one of these. Absent once `complete`,
   * because a run that has ended has no progress left to hide or show.
   */
  covered?: Array<[number, number]>
  /** Whether anything more is coming. A cached transcript arrives complete. */
  complete: boolean
  /** Set when the run ended early; `cues` then holds whatever was finished. */
  error?: string
}

export function isAsrCuesMessage(msg: unknown): msg is AsrCuesMessage {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    (msg as { type?: unknown }).type === 'bb-subsgen:asr-cues' &&
    Array.isArray((msg as { cues?: unknown }).cues)
  )
}

/**
 * What the worker sends back as each batch lands.
 *
 * Lines are addressed by cue start, not by index. Index is positional, and on a
 * transcribed video the cue list grows underneath the pass as chunks land — so
 * a batch answered against one numbering would be painted onto another. Start is
 * the identity `llm-cache` and `Context` already use.
 */
export interface LlmTranslationsMessage {
  type: 'bb-subsgen:llm-translations'
  videoId: string
  lang: TranslationLang
  lines: Array<{ start: number; text: string }>
}

export function isLlmTranslationsMessage(msg: unknown): msg is LlmTranslationsMessage {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    (msg as { type?: unknown }).type === 'bb-subsgen:llm-translations' &&
    Array.isArray((msg as { lines?: unknown }).lines)
  )
}

/**
 * Asks the worker for a language's whole lexicon, to segment with.
 *
 * Request/response, and never per-token: `segment()` runs a Viterbi parse that
 * needs the whole `Map` synchronously, once per cue and once per caret move, so
 * there is no shape smaller than "the whole lexicon text" that would work. The
 * transfer is a wash against the per-page `fetch` of `dict/words.bin` this
 * replaces — see src/dict/store.ts for where it now lives.
 */
export interface GetLexiconMessage {
  type: 'bb-subsgen:get-lexicon'
  lang: string
}

export interface GetLexiconResponse {
  /** Null when the language has no dictionary installed. */
  text: string | null
}

export function isGetLexiconMessage(msg: unknown): msg is GetLexiconMessage {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    (msg as { type?: unknown }).type === 'bb-subsgen:get-lexicon' &&
    typeof (msg as { lang?: unknown }).lang === 'string'
  )
}

export interface DictStatus {
  lang: string
  installed: boolean
  entryCount: number
  installedAt: number | null
}

/**
 * The cheap dictionary check: whether each enabled language is installed,
 * without moving its lexicon. Request/response, so the popup and the setup
 * wizard can ask the worker rather than opening the database themselves.
 */
export interface DictStatusMessage {
  type: 'bb-subsgen:dict-status'
}

export interface DictStatusResponse {
  languages: DictStatus[]
}

export function isDictStatusMessage(msg: unknown): msg is DictStatusMessage {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    (msg as { type?: unknown }).type === 'bb-subsgen:dict-status'
  )
}

/**
 * Fire-and-forget, from the setup wizard to the worker after an install or a
 * delete, so the toolbar badge recomputes. Its own guard rather than joining an
 * existing union: none of them fit a single-member notification, and forcing
 * it into one would cost more than a second guard does.
 */
export interface DictChangedMessage {
  type: 'bb-subsgen:dict-changed'
}

export function isDictChangedMessage(msg: unknown): msg is DictChangedMessage {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    (msg as { type?: unknown }).type === 'bb-subsgen:dict-changed'
  )
}
