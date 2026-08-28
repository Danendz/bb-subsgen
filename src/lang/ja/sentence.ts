// Which characters end a Japanese sentence. The scan that uses them is
// language-neutral and lives in `../sentence.ts`.

import { sentenceTextAt as scan } from '../sentence'

// 。！？ are shared with Chinese, and their ASCII forms turn up for the same
// reason. `、` is deliberately absent: it is a comma, and a clause is not a
// sentence. `」` is not here either — a quotation ends on the terminator inside
// it, and treating the bracket as one would cut every quoted line in two.
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
