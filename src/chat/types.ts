import type { LlmRole } from '../llm/types'

/**
 * The passage a conversation was opened about.
 *
 * Snapshotted onto the chat rather than looked up again, so reopening a
 * conversation shows the lines it was actually about even if the video has since
 * gone. It is a display record: the prompt that was sent is rebuilt from it, not
 * stored, so an improvement to the prompt reaches old conversations too.
 */
export interface ChatContext {
  /** The word the explanation was asked about, when it was asked about one. */
  target?: string
  /** The line that word appeared in. */
  line: string
  /** The lines around it that were sent for context. */
  before: string[]
  after: string[]
  bvid?: string
  /** Cue start in seconds — what a jump-back link rewinds from. */
  start?: number
  /** Video or page title, for display. */
  sourceTitle?: string
  /**
   * Which words in the line you had already mastered when you asked.
   *
   * Snapshotted rather than recomputed, like `Context.translation` next door: it
   * is what the explanation was written against, and an explanation that
   * silently stops matching the reasoning behind it is worse than a slightly
   * stale one. It also keeps the model from re-teaching 是 and 了 every time.
   */
  knownWords?: string[]
  /** The ones you had not, with enough dictionary to keep the model honest. */
  newWords?: Glossed[]
}

export interface Glossed {
  word: string
  pinyin: string
  gloss: string
}

export interface Chat {
  id: string
  /** Taken from the opening message; see `titleFrom`. */
  title: string
  /**
   * The model this conversation ran on.
   *
   * Stored per conversation rather than read from settings at display time, so
   * reopening an old chat says which model actually produced it.
   */
  model: string
  /** The flashcard it was opened from, when it was opened from one. */
  itemId?: string
  context?: ChatContext
  createdAt: number
  updatedAt: number
}

/**
 * One stored turn.
 *
 * Only `user` and `assistant` are ever written: the system prompt is rebuilt
 * from `Chat.context` every time the conversation is sent, so it is never a
 * stale copy of a prompt that has since been improved.
 */
export interface ChatMessage {
  /** autoIncrement, so ascending key order is the order they were said in. */
  seq: number
  chatId: string
  role: Exclude<LlmRole, 'system'>
  content: string
  at: number
}
