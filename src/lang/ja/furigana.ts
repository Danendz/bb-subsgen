// Where a Japanese reading actually sits over the word it reads.
//
// Chinese draws a reading as one flat run above the whole word and gets away
// with it, because one hanzi is one syllable at roughly one width. 食べる is
// たべる, the furigana belongs over 食 alone, and neither the surface nor the
// reading carries a mark saying so. `ReadingPart.base` is the slot #8 cut for
// the answer; this fills it.
//
// **Grouping is per run, never per character.** 食べ物/たべもの comes apart
// cleanly — the べ between the kanji anchors both sides — but 昨日/きのう does
// not: two characters, and no rule saying きの belongs to 昨. Splitting a run
// per character would have to guess in exactly the place `readingParts` refuses
// to (`zh/reading.ts`, on 不入虎穴，焉得虎子). Per run, the question never
// comes up.
//
// **Normalise, but do not tolerate.** Katakana folds to hiragana before
// matching, because a katakana surface is routinely paired with a hiragana
// reading and they are the same sounds twice. Rendaku and gemination — は→ば,
// つ→っ — are deliberately not patched around, though tolerating them would
// align a few more compounds. What a tolerant matcher buys in coverage it pays
// for in alignments that are confidently wrong, and a wrong reading drags the
// gloss along with it. Those words take the failure path instead, which degrades
// to exactly what Chinese does today: one run above the whole word.

import type { ReadingPart } from '../pack'
import { needsFurigana, toHiragana } from './script'

/** Japanese marks no tone: pitch accent is not modelled, and is not planned. */
function part(base: string, text: string): ReadingPart {
  return { base, text, tone: null }
}

interface Run {
  text: string
  /** Whether furigana is drawn over this run, or it is read as it is written. */
  annotated: boolean
}

function runs(surface: string): Run[] {
  const out: Run[] = []
  for (const char of surface) {
    const annotated = needsFurigana(char)
    const last = out[out.length - 1]
    if (last && last.annotated === annotated) last.text += char
    else out.push({ text: char, annotated })
  }
  return out
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * A reading cut into one part per run of the surface, aligned to it.
 *
 * Kana runs carry `text: ''` — nothing is drawn over what is already read as
 * written. When the reading cannot be aligned at all the answer is a single
 * part with `base: ''`, the shape #8 documented for "alignment not known" and
 * the one `readingParts` already emits. `{ base: surface }` would instead
 * assert that the whole reading lines up with the whole surface — arguably
 * true, but it would make `base: ''` unreachable in Japanese and quietly give
 * the field two meanings across two languages.
 */
export function furiganaParts(surface: string, reading: string): ReadingPart[] {
  const parts = runs(surface)
  if (!parts.length) return []
  if (!parts.some((run) => run.annotated)) return [part(surface, '')]

  const trimmed = reading.trim()
  const pattern = new RegExp(
    `^${parts
      .map((run) => (run.annotated ? '(.+?)' : escapeRegExp(toHiragana(run.text))))
      .join('')}$`,
    'u',
  )
  const match = pattern.exec(toHiragana(trimmed))
  if (!match) return [part('', trimmed)]

  // `toHiragana` maps one code point to one code point, so an offset into the
  // normalised reading is the same offset into what the dictionary wrote — and
  // that is what the parts carry. Walking the runs in order recovers those
  // offsets without asking the engine for capture indices.
  let read = 0
  let group = 0
  return parts.map((run) => {
    const length = run.annotated ? match[++group].length : run.text.length
    const text = trimmed.slice(read, read + length)
    read += length
    return part(run.text, run.annotated ? text : '')
  })
}
