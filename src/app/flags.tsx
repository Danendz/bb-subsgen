// A flag per studiable language, for the picker cards.
//
// Vendored as inline SVG, from the public-domain svg-country-flags collection.
// Two considered alternatives, both rejected:
//
// - a flag-icon package. The only runtime dependency this project has is
//   Preact, and one drawing per language does not justify a second.
// - flag emoji. Windows Chrome has no glyph for a regional-indicator pair and
//   renders 🇨🇳 as two boxed letters — the one platform this extension targets
//   is the one that gets it wrong.
//
// Unknown codes render nothing rather than throwing, so a language that arrives
// before its flag does degrades to a name-only card.

import type { JSX } from 'preact'

/**
 * A five-pointed star of outer radius 1, centred on the origin and pointing up.
 *
 * Drawn as a self-intersecting pentagram and filled nonzero, which is shorter
 * than spelling out ten alternating vertices and renders identically.
 */
const STAR = 'M0,-1 L0.588,0.809 L-0.951,-0.309 L0.951,-0.309 L-0.588,0.809 Z'

// Functions rather than stored vnodes: a Preact vnode carries a pointer to the
// DOM node it rendered, so handing the same object to two places at once is not
// safe. Building a fresh one per render costs nothing at this size.
const FLAGS: Record<string, () => JSX.Element> = {
  // 30×20, the flag's official proportions. The large star sits at (5,5) with
  // radius 3; each small star has radius 1 and is rotated so one point aims at
  // the centre of the large one.
  zh: () => (
    <svg viewBox="0 0 30 20" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect width="30" height="20" fill="#ee1c25" />
      <g fill="#ff0">
        <path d={STAR} transform="translate(5 5) scale(3)" />
        <path d={STAR} transform="translate(10 2) rotate(239.04)" />
        <path d={STAR} transform="translate(12 4) rotate(261.87)" />
        <path d={STAR} transform="translate(12 7) rotate(285.95)" />
        <path d={STAR} transform="translate(10 9) rotate(308.66)" />
      </g>
    </svg>
  ),
}

export function Flag({ lang }: { lang: string }) {
  return FLAGS[lang]?.() ?? null
}
