// Bringing a card's stored translation up to the language it is being read in.
//
// The target is a setting, so a deck outlives the choice that filled it. Rather
// than hide a mismatched card (which would silently shrink the deck) or show it
// unmarked (which is the bug), the reveal re-translates it once and writes the
// answer back, so the cost is paid per card and never again.
//
// The decision is not here — `staleTranslations` and `withTranslations` in
// src/flashcards/context-translation.ts hold it, so it can be tested without a
// DOM. What is here is only the glue: when to run, and what to do when the
// translator will not build.
//
// On-device translator only, deliberately no LLM fallback. Review is interactive
// work, and there is one GPU — a model call on every reveal is exactly what
// `.claude/rules/llm-and-asr.md` says a long-running pass must not do to chat.
// Where Chrome has no pair, the card keeps the translation it already had.

import { useEffect, useRef } from 'preact/hooks'
import { replaceContexts } from '../../background/flashcards-store'
import { staleTranslations, withTranslations } from '../../flashcards/context-translation'
import type { Context, Item } from '../../flashcards/types'
import { createTranslator, isTranslatorSupported } from '../../lang/translate'
import type { TranslationLang } from '../../shared/settings'

/**
 * Re-translates `current`'s contexts when they are in the wrong language.
 *
 * `onHealed` is called with what to show, before the write resolves — the
 * learner is looking at the card now, and the write is only so that the next
 * sitting does not repeat the work.
 */
export function useTranslationHealing(
  current: Item | null,
  target: TranslationLang | null,
  onHealed: (id: string, contexts: Context[]) => void,
): void {
  // Per card, not per session: a card that failed is worth another attempt on
  // its next appearance, but retrying it inside one reveal would spin.
  const attempted = useRef(new Set<string>())

  useEffect(() => {
    if (!current || !target || !isTranslatorSupported()) return

    const key = `${current.id}:${target}`
    if (attempted.current.has(key)) return

    const stale = staleTranslations(current.contexts, target)
    if (!stale.length) return
    attempted.current.add(key)

    let live = true
    void (async () => {
      let translated: Map<number, string>
      try {
        // Source is the card's own language, not an assumed Chinese: a Japanese
        // card translates from Japanese.
        const translator = await createTranslator(target, undefined, current.lang)
        const results = await Promise.all(
          stale.map(async ({ index, text }) => [index, await translator.translate(text)] as const),
        )
        translated = new Map(results)
      } catch {
        // No pair on this machine, or no user gesture to build one with. The
        // card keeps the translation it has, which is the whole reason that
        // translation is frozen on the card in the first place.
        return
      }
      if (!live) return

      const healed = withTranslations(current.contexts, target, translated)
      if (healed === current.contexts) return

      onHealed(current.id, healed)
      // Not awaited before showing, but still awaited: an unawaited write is one
      // that loses the race with the page being closed mid-review.
      await replaceContexts(current.id, healed)
    })()

    return () => {
      live = false
    }
  }, [current?.id, target])
}
