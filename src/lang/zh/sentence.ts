// Which characters end a Chinese sentence. The scan that uses them is
// language-neutral and lives in `../sentence.ts`.

import { sentenceTextAt as scan } from '../sentence'

// The CJK set, plus their ASCII equivalents: subtitle files and web pages mix
// the two freely, and a line punctuated with `?` is as finished as one
// punctuated with `？`.
export const TERMINATORS: ReadonlySet<string> = new Set([
  '。',
  '！',
  '？',
  '!',
  '?',
  '\n',
  '…',
  '；',
  ';',
])

export function sentenceTextAt(text: string, index: number): string {
  return scan(text, index, TERMINATORS)
}
