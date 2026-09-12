// The navigation rail's glyphs.
//
// Hand-authored for the same reason src/app/flags.tsx is: the extension ships
// offline, so a CDN is not an option, and an icon font would be a second
// runtime dependency for seven drawings. Modelled on that file — named
// exports, `currentColor`, one fixed viewBox — so a rail item can be coloured
// by the rule that colours its label.
//
// Deliberately plain: one stroke weight, no fills, no detail below 2px. These
// sit at 18px beside a word that says the same thing, and a glyph that needs
// studying at that size is a glyph doing the label's job badly.

import type { JSX } from 'preact'

const STROKE = {
  fill: 'none',
  stroke: 'currentColor',
  'stroke-width': 1.6,
  'stroke-linecap': 'round',
  'stroke-linejoin': 'round',
} as const

function Glyph({ children }: { children: JSX.Element | JSX.Element[] }) {
  return (
    <svg class="icon" viewBox="0 0 24 24" aria-hidden="true" {...STROKE}>
      {children}
    </svg>
  )
}

/** The path: stops on a road, which is what the home screen draws. */
export function LearnIcon() {
  return (
    <Glyph>
      <path d="M6 20c0-3 12-3 12-8s-8-4-8-7" />
      <circle cx="10" cy="4" r="1.8" />
      <circle cx="18" cy="12" r="1.8" />
      <circle cx="6" cy="20" r="1.8" />
    </Glyph>
  )
}

/** Review: a card coming round again. */
export function ReviewIcon() {
  return (
    <Glyph>
      <rect x="3" y="6" width="14" height="12" rx="2.5" />
      <path d="M17 9h2.5a1.5 1.5 0 0 1 1.5 1.5V18" />
      <path d="M19 15.5 21 18l2-2.5" />
    </Glyph>
  )
}

export function DictionaryIcon() {
  return (
    <Glyph>
      <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H19v16H5.5A1.5 1.5 0 0 1 4 18.5z" />
      <path d="M4 17h15" />
      <path d="M9 8h6" />
    </Glyph>
  )
}

export function ChatIcon() {
  return (
    <Glyph>
      <path d="M20 12.5c0 3.6-3.6 6.5-8 6.5a9.7 9.7 0 0 1-2.5-.3L5 20.5l1-3.3A6.2 6.2 0 0 1 4 12.5C4 8.9 7.6 6 12 6s8 2.9 8 6.5Z" />
    </Glyph>
  )
}

export function VideosIcon() {
  return (
    <Glyph>
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <path d="M10.5 9.5 15 12l-4.5 2.5z" />
    </Glyph>
  )
}

export function SettingsIcon() {
  return (
    <Glyph>
      <path d="M4 8h10M18 8h2M4 16h4M12 16h8" />
      <circle cx="16" cy="8" r="2" />
      <circle cx="10" cy="16" r="2" />
    </Glyph>
  )
}

/** Data: stacked stores, the shape every database icon has settled on. */
export function DataIcon() {
  return (
    <Glyph>
      <ellipse cx="12" cy="6.5" rx="7" ry="2.5" />
      <path d="M5 6.5v11c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-11" />
      <path d="M5 12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5" />
    </Glyph>
  )
}

/** Points down while the language menu is shut, and is rotated open by CSS. */
export function ChevronIcon() {
  return (
    <Glyph>
      <path d="M7 10l5 5 5-5" />
    </Glyph>
  )
}

export function FlameIcon() {
  return (
    <Glyph>
      <path d="M12 3.5s4.5 3.7 4.5 8a4.5 4.5 0 0 1-9 0c0-1.6.8-3 1.6-3.9.2 1.3 1 2 1.9 2 1.2 0 1.6-1.3 1.6-2.6 0-1.2-.3-2.4-.6-3.5Z" />
    </Glyph>
  )
}

/** A circle you have finished, and the one the review screen already marks right. */
export function CheckIcon() {
  return (
    <Glyph>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </Glyph>
  )
}

/** A circle you can run now. */
export function PlayIcon() {
  return (
    <Glyph>
      <path d="M8 5.5l10 6.5-10 6.5z" />
    </Glyph>
  )
}

/** A circle still waiting on words you have not met. */
export function LockIcon() {
  return (
    <Glyph>
      <rect x="5" y="10.5" width="14" height="9.5" rx="2.2" />
      <path d="M8.5 10.5V7.8a3.5 3.5 0 0 1 7 0v2.7" />
    </Glyph>
  )
}
