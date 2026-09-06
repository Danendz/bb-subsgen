// A message with something in the middle of it that is not text.
//
// Several hints read "Run it with `npm run ytdlp` in the extension's
// repository" — one sentence with a `<code>` inside. Splitting that into a
// before-key and an after-key would fix the order of the sentence in English
// and hand every other language a broken one, since where the code lands in the
// clause is not the same in German as it is here. So the message keeps a named
// slot and the translator moves it.

import type { ComponentChildren } from 'preact'

const SLOT = /\{(\w+)\}/g

export function Rich({ text, slots }: { text: string; slots: Record<string, ComponentChildren> }) {
  const out: ComponentChildren[] = []
  let last = 0

  for (const match of text.matchAll(SLOT)) {
    const filling = slots[match[1]]
    if (filling === undefined) continue
    out.push(text.slice(last, match.index))
    out.push(filling)
    last = match.index + match[0].length
  }
  out.push(text.slice(last))

  return <>{out}</>
}
