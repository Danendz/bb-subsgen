// Translating a subtitle track in batches.
//
// Batching is the whole point, not an optimization. A line-at-a-time
// translation of Chinese is measurably worse than a windowed one — dropped
// pronouns, topic chains and no tense marking mean a line frequently cannot be
// read on its own — and that gap is wider for Chinese than for European
// languages. Twenty-five lines is enough context to carry a topic chain and
// short enough to leave a small model room to answer.
//
// The other half of this file exists because models skip and merge lines in
// long structured outputs. That is the normal path, not an edge case, and it is
// why every line carries an explicit id and why the reply is checked against
// what was sent rather than trusted.

import type { Glossed } from '../chat/types'
import type { TranslationLang } from '../shared/settings'
import { glossLine } from './glossary'
import type { JsonSchemaFormat } from './types'

/** Lines per request. */
export const BATCH_SIZE = 25

/**
 * How many lines of the previous batch are repeated as context.
 *
 * Without them every batch boundary resets the topic, and a pronoun resolved on
 * line 25 is anonymous again on line 26. Their accepted translations come too,
 * so names and register stay consistent across the whole video rather than
 * being re-invented every twenty-five lines.
 */
export const SEAM_LINES = 3

export interface BatchLine {
  /** The cue's index in the track — its identity for the whole round trip. */
  id: number
  zh: string
}

/**
 * The batches a track breaks into, in track order.
 *
 * Blank cues are left out rather than sent: they cost tokens, they invite the
 * model to invent something for them, and there is nothing to translate.
 */
export function planBatches(texts: string[], size = BATCH_SIZE): BatchLine[][] {
  const batches: BatchLine[][] = []
  let current: BatchLine[] = []

  texts.forEach((zh, id) => {
    if (!zh.trim()) return
    current.push({ id, zh })
    if (current.length === size) {
      batches.push(current)
      current = []
    }
  })

  if (current.length) batches.push(current)
  return batches
}

/**
 * The batch to translate next: the one at or after the playhead, wrapping.
 *
 * The same rule the on-device pass uses one cue at a time, raised to a batch.
 * Re-read on every iteration rather than computed once, so seeking re-orders
 * the remaining work without any machinery for it: what you are about to watch
 * is translated before what you have already gone past.
 *
 * Null when nothing is left.
 */
export function pickBatch(pending: BatchLine[][], playheadIndex: number): number | null {
  let ahead: number | null = null
  let lowest: number | null = null

  pending.forEach((batch, at) => {
    const first = batch[0]?.id ?? Infinity
    const last = batch[batch.length - 1]?.id ?? -Infinity

    if (lowest === null || first < (pending[lowest][0]?.id ?? Infinity)) lowest = at
    // Contains the playhead, or lies entirely after it.
    if (last >= playheadIndex && (ahead === null || first < (pending[ahead][0]?.id ?? Infinity))) {
      ahead = at
    }
  })

  return ahead ?? lowest
}

export interface Reconciled {
  /** Lines that came back, matched to what was sent. */
  accepted: Map<number, string>
  /** Ids that did not, in the order they were sent. */
  missing: number[]
}

interface RawLine {
  id?: unknown
  zh?: unknown
  /** What the schema asks for. */
  text?: unknown
  /** What a model reaching past the schema tends to produce anyway. */
  en?: unknown
}

function rowsOf(received: unknown): RawLine[] {
  if (Array.isArray(received)) return received as RawLine[]
  if (received && typeof received === 'object') {
    // Models wrap the array under whatever noun the prompt used; accept the
    // ones actually seen rather than insisting on the schema's spelling.
    for (const key of ['lines', 'translations', 'result', 'results', 'data']) {
      const value = (received as Record<string, unknown>)[key]
      if (Array.isArray(value)) return value as RawLine[]
    }
  }
  return []
}

/**
 * Matches a reply against what was asked for.
 *
 * Three things are checked, and all three fail regularly on small models: that
 * the id was one of the ones sent, that the translation is actually there, and
 * that the Chinese echoed back is the Chinese that id was given. The last is
 * the one worth the tokens it costs — a model that drops a line mid-array and
 * carries on renumbering produces perfectly valid ids attached to the wrong
 * lines, and nothing else here would notice.
 */
export function reconcile(sent: BatchLine[], received: unknown): Reconciled {
  const wanted = new Map(sent.map((line) => [line.id, line.zh]))
  const accepted = new Map<number, string>()

  for (const row of rowsOf(received)) {
    const id = typeof row.id === 'number' ? row.id : Number(row.id)
    if (!Number.isInteger(id) || !wanted.has(id)) continue
    if (accepted.has(id)) continue // a repeat; the first answer stands

    // `text` is what was asked for; `en` is accepted because the schema is a
    // request and a model that ignores it should not lose its line over the
    // name it chose.
    const translated = [row.text, row.en].find((value) => typeof value === 'string' && value.trim())
    const en = typeof translated === 'string' ? translated.trim() : ''
    if (!en) continue

    // An echo that disagrees means the reply has slipped out of step with the
    // request, whatever its ids say.
    if (typeof row.zh === 'string' && row.zh.trim() && row.zh.trim() !== wanted.get(id)!.trim()) {
      continue
    }

    accepted.set(id, en)
  }

  return {
    accepted,
    missing: sent.filter((line) => !accepted.has(line.id)).map((line) => line.id),
  }
}

/**
 * The shape the server is asked to answer in.
 *
 * The output field is called `text` and must never be named after a language.
 * Verified against LM Studio: the same model, prompt and temperature, asked to
 * translate into Russian, answers in English when this field is called `en` and
 * in Russian when it is not. A field name sits closer to the tokens being
 * generated than the system prompt does, and small models follow it instead.
 */
export const BATCH_SCHEMA: JsonSchemaFormat = {
  type: 'json_schema',
  json_schema: {
    name: 'subtitle_translations',
    strict: true,
    schema: {
      type: 'object',
      properties: {
        lines: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'integer' },
              zh: { type: 'string' },
              text: { type: 'string' },
            },
            required: ['id', 'zh', 'text'],
            additionalProperties: false,
          },
        },
      },
      required: ['lines'],
      additionalProperties: false,
    },
  },
}

const LANGUAGE_NAME: Record<TranslationLang, string> = { en: 'English', ru: 'Russian' }

/**
 * Rules that only some target languages need.
 *
 * Chinese marks no gender on verbs or adjectives and Russian marks it
 * everywhere, so a Russian translation has to decide something the source never
 * said. A small model decides it twice in one sentence and contradicts itself —
 * the reported case was 你愿意做我的老公吗 as "Ты согласна быть моим мужем?",
 * feminine on the adjective and male on the noun, in six words.
 *
 * Kept out of the shared rules rather than added to them: English marks none of
 * this, and the four rules above are already as many as a small quantized model
 * reliably holds. A language that does not need this should not pay prefill for
 * it on every batch of every video.
 */
const LANGUAGE_RULES: Partial<Record<TranslationLang, string[]>> = {
  ru: [
    'Russian marks gender on past-tense verbs, short adjectives and participles. Work out from the line and the ones around it who is speaking and who is being spoken to — 老公, 老婆, 姐姐, 哥哥, 先生, 小姐, 儿子, 女儿 settle it — and keep every ending in a sentence agreeing with that one decision.',
    'When nothing in the passage settles it, prefer wording that does not force a choice over guessing at one.',
  ],
}

export interface VideoPreamble {
  title: string
  description?: string
}

export interface BatchPrompt {
  lines: BatchLine[]
  lang: TranslationLang
  /** Rare words and names in these lines, so they are not guessed at. */
  glossary?: Glossed[]
  /** The tail of the previous batch, already translated. */
  seam?: Array<{ zh: string; en: string }>
  video?: VideoPreamble
}

/** How much of a video description is worth carrying on every request. */
const DESCRIPTION_LIMIT = 400

export function batchSystem({ lang, video }: BatchPrompt): string {
  const parts = [
    `You translate Chinese video subtitles into ${LANGUAGE_NAME[lang]}.`,
    'Translate every line you are given, and return one entry per line with the id it was given.',
    'Never merge two lines into one entry, never split one line into two, and never leave a line out — even when a line is only a fragment, a name, or a filler word.',
    'Translate what the line says, in natural spoken register. Do not explain, annotate, or add anything that is not in the Chinese.',
    'Use the surrounding lines to resolve dropped pronouns and topics. They are context; only the numbered lines are to be translated.',
    ...(LANGUAGE_RULES[lang] ?? []),
  ]

  if (video?.title) {
    // The single cheapest quality fix available: a cooking video and a history
    // video pick opposite senses of the same word, and one line of subject
    // matter settles it.
    parts.push(`\nThis is from a video titled: ${video.title}`)
    if (video.description?.trim()) {
      parts.push(`Description: ${video.description.trim().slice(0, DESCRIPTION_LIMIT)}`)
    }
  }

  return parts.join('\n')
}

export function batchUser({ lines, lang, glossary, seam }: BatchPrompt): string {
  const parts: string[] = []

  if (seam?.length) {
    parts.push(
      [
        'Already translated, immediately before these lines. Context only — do not return them:',
        ...seam.map((line) => `${line.zh} → ${line.en}`),
      ].join('\n'),
    )
  }

  if (glossary?.length) {
    parts.push(
      ['Dictionary entries for uncommon words below:', ...glossary.map(glossLine)].join('\n'),
    )
  }

  // The language is named here as well as in the system turn. The glossary
  // above is English whatever the target is — CC-CEDICT only has the one — so
  // by this point the request is surrounded by English, and the last
  // instruction before the lines themselves is the one worth spending.
  parts.push(
    [
      `Translate these ${lines.length} lines into ${LANGUAGE_NAME[lang]}.`,
      `Return exactly ${lines.length} entries, each with its translation in the "text" field.`,
      // Said twice, for the same reason the language is: this is the last thing
      // read before the lines themselves, and a small model follows what is
      // nearest the tokens it is about to generate.
      ...(LANGUAGE_RULES[lang]
        ? ['Match every gender ending to who is speaking and who is being spoken to.']
        : []),
      ...lines.map((line) => `${line.id}\t${line.zh}`),
    ].join('\n'),
  )

  return parts.join('\n\n')
}
