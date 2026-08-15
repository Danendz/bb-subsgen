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
