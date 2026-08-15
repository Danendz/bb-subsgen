// Just enough markdown to stop a reply looking broken.
//
// Not a markdown renderer and not trying to be one. Models write `**了**` and
// `` `le` `` constantly whether or not they are asked to, and showing those
// asterisks verbatim reads as a bug; everything past bold and code is rare
// enough in a two-paragraph grammar explanation to leave as written.
//
// Pure and separate from the component so the tokenizer can be tested without
// rendering anything.

export interface Span {
  kind: 'text' | 'bold' | 'code'
  text: string
}

// Bold before code, so `**a**` inside a sentence wins over a stray backtick.
const PATTERN = /\*\*([^*]+)\*\*|`([^`]+)`/g

export function inlineSpans(line: string): Span[] {
  const spans: Span[] = []
  let at = 0

  for (const match of line.matchAll(PATTERN)) {
    const start = match.index
    if (start > at) spans.push({ kind: 'text', text: line.slice(at, start) })

    const [whole, bold, code] = match
    spans.push(
      bold !== undefined ? { kind: 'bold', text: bold } : { kind: 'code', text: code },
    )
    at = start + whole.length
  }

  if (at < line.length) spans.push({ kind: 'text', text: line.slice(at) })
  return spans
}

/**
 * A reply split into lines, each tokenized.
 *
 * Blank lines are kept: they are the paragraph breaks, and dropping them runs
 * an explanation and its example together.
 */
export function renderable(content: string): Span[][] {
  return content.split('\n').map(inlineSpans)
}
