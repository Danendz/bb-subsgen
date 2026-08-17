// Turning a raw model reply into something usable.
//
// Local models need more of this than hosted ones do: reasoning models emit
// their scratchpad inline, and the small quantized models this feature is aimed
// at wrap structured replies in prose no matter how firmly they are asked not to.

/**
 * Removes a reasoning model's inline scratchpad.
 *
 * Qwen3, DeepSeek-R1 distills and friends emit `<think>…</think>` in the content
 * stream rather than in a separate field, so anything that displays or parses
 * the content has to strip it. An unclosed block means the reply was cut off
 * mid-thought, and everything from the opening tag on is dropped with it.
 */
export function stripThinkBlocks(content: string): string {
  return content
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<think>[\s\S]*$/i, '')
    .trim()
}

/**
 * The JSON in a reply, however it was wrapped.
 *
 * `response_format` is a request, not a guarantee: servers that do not
 * implement it ignore the field rather than refusing, and models that do
 * implement it still sometimes lead with "Here are the translations:" or fence
 * the block. Scanning to the outermost brace is what turns "the server does not
 * support structured output" from a broken feature into a slightly worse one.
 *
 * Null when there is nothing parseable, which the caller treats as a batch that
 * came back empty — every line in it is then retried.
 */
export function extractJson(content: string): unknown {
  const text = stripThinkBlocks(content)

  try {
    return JSON.parse(text)
  } catch {
    // Not bare JSON; fall through and go looking for it.
  }

  const start = text.search(/[[{]/)
  if (start === -1) return null

  // Widest match first: an object containing an array would otherwise be cut
  // short at the array's own closing bracket.
  const open = text[start]
  const end = text.lastIndexOf(open === '{' ? '}' : ']')
  if (end <= start) return null

  try {
    return JSON.parse(text.slice(start, end + 1))
  } catch {
    return null
  }
}
