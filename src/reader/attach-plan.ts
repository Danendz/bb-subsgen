// Whether the reader should be attached to this page, and in which language.
//
// Modelled on `content/transcribe-plan.ts`, including its `verdict`: five
// booleans-and-strings collapsing into one of four actions, where the wrong
// answer is invisible until it is a page annotated in the wrong language.
//
// `restart` is why this exists now. With one pack installed a language could
// never change under a running reader, so the branch was unreachable; #17 made
// it reachable, and nothing in a `node` suite can open the page that would
// exercise it.
//
// This resolves nothing and performs nothing: it is *told* whether a pack
// exists rather than asking the registry, so `main.ts` keeps `location.origin`,
// `packFor`, `console` and every effect.

export interface AttachSituation {
  /** Whether the reader is switched on for this origin. */
  enabled: boolean
  /** The language this page should be read in — the session override, or the site's. */
  resolvedLang: string
  /** The language the attached reader was built for. Null when nothing is attached. */
  activeLang: string | null
  attached: boolean
  /** Whether a pack exists for `resolvedLang`. */
  hasPack: boolean
}

export interface AttachPlan {
  action: 'start' | 'stop' | 'restart' | 'nothing'
  /** One line for the console, saying which branch was taken and why. */
  verdict: string
}

export function planAttach({
  enabled,
  resolvedLang,
  activeLang,
  attached,
  hasPack,
}: AttachSituation): AttachPlan {
  if (!enabled) {
    return attached
      ? { action: 'stop', verdict: 'reader is off for this site' }
      : { action: 'nothing', verdict: 'reader is off for this site' }
  }

  // No pack means no segmenter and no script test, which is every question the
  // reader would ask — so it never attaches at all, rather than attaching and
  // finding nothing anywhere. Reachable while attached too: switching to a
  // language with no pack has to take the running reader down rather than
  // leaving it on the old one.
  if (!hasPack) {
    const verdict = `no language pack for ${resolvedLang}`
    return attached ? { action: 'stop', verdict } : { action: 'nothing', verdict }
  }

  if (!attached) return { action: 'start', verdict: `reading this page in ${resolvedLang}` }

  // The segmenter and the definitions have to move together, and there is no
  // way to swap either under a live reader — so the language changing is a
  // teardown and a rebuild, not an update.
  if (resolvedLang !== activeLang) {
    return { action: 'restart', verdict: `rereading this page in ${resolvedLang}` }
  }

  return { action: 'nothing', verdict: `already reading this page in ${activeLang}` }
}
