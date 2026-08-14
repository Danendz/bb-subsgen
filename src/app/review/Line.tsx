// A Chinese line on a study card: readings above, meanings on demand.
//
// Chinese is written without spaces, so a line holding one word you cannot read
// is a line you cannot get through — and the card offers no way to ask. This
// gives every word a reading you can turn on and a meaning you can ask for,
// without ever volunteering the meaning to a question that is asking for it.

import { parseDefinitions } from '../../lang/definitions'
import { rankEntries } from '../../lang/entries'
import type { CedictEntry } from '../../lang/dict'
import { Pinyin } from '../pinyin'
import { lineTokens, type LineToken } from './tokens'

/** Definitions shown in one popup. More is a paragraph, not a reminder. */
const SENSES = 3

export interface LineProps {
  text: string
  /** Headword → pinyin, what the line is segmented against. */
  words: Map<string, string>
  known: Set<string>
  /** Looked up by the card, keyed by headword. Absent while it is still loading. */
  defs?: Record<string, CedictEntry[]> | null
  readings?: boolean
  mark?: string
  blank?: string
}

export function Line({ text, words, known, defs, readings = false, mark, blank }: LineProps) {
  const tokens = lineTokens(text, words, { known, readings, mark, blank })

  return (
    <span class="line-words">
      {tokens.map((token, i) => (
        <Word key={i} token={token} entries={defs?.[token.text]} reserve={readings} />
      ))}
    </span>
  )
}

/**
 * One word, with its reading above and its meaning behind a hover.
 *
 * The popup is CSS-driven rather than state-driven: a line is a handful of
 * words, so rendering each one's tooltip costs nothing, and doing it this way
 * means hover, tap and keyboard focus all work without any of them being
 * handled separately.
 */
function Word({
  token,
  entries,
  reserve,
}: {
  token: LineToken
  entries?: CedictEntry[]
  /** Whether the line keeps a row for readings, so its characters share a baseline. */
  reserve: boolean
}) {
  if (token.blanked) {
    return (
      <span class="line-word">
        {reserve && <span class="ruby" />}
        {/* Sized from the word it hides, so the gap says how much is missing. */}
        <span class="blank">{'　'.repeat(Math.max(1, token.text.length))}</span>
      </span>
    )
  }

  if (!token.han) return <span class="line-word punct">{token.text}</span>

  const [primary] = rankEntries(entries ?? [], token.text)
  const gloss = primary
    ? parseDefinitions(primary.definitions).definitions.slice(0, SENSES).join('; ')
    : ''
  // The card's own reading is the fallback: a word the dictionary has no entry
  // for can still have been segmented, and half an answer beats none.
  const reading = primary?.pinyin ?? token.pinyin ?? ''
  const askable = Boolean(reading || gloss)

  return (
    <span class={`line-word ${askable ? 'askable' : ''}`} tabIndex={askable ? 0 : undefined}>
      {reserve && (
        // Withheld rather than absent, so a line of mixed known and unknown
        // words still sits on one baseline. The same reason the overlay does it.
        <span class={`ruby ${token.reading ? '' : 'withheld'}`}>
          <Pinyin pinyin={token.pinyin ?? ''} />
        </span>
      )}
      <span class={`zh ${token.marked ? 'marked' : ''}`}>{token.text}</span>
      {askable && (
        <span class="word-tip" role="tooltip">
          <span class="tip-head">
            <span class="tip-word">{token.text}</span>
            <Pinyin pinyin={reading} />
          </span>
          {gloss && <span class="tip-gloss">{gloss}</span>}
        </span>
      )}
    </span>
  )
}
