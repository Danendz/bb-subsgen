// The path itself: sections, units, and the circles you press.
//
// Presentational, and deliberately so — every rule about what a circle is worth
// lives in src/flashcards/path.ts, where it can be tested without a screen.
// What is decided here is only what is on screen at once.
//
// That turns out to be the hard part. The pinned list is ~11,400 words, which
// is 1,400-odd circles: rendered flat that is a scroll bar with no landmarks in
// it, and 1,400 `circleState` calls on every keystroke elsewhere on the page.
// So a section renders nothing until it is opened, an opened one renders a
// window of three units around where you are, and the window is widened by
// pressing for it.

import { useState } from 'preact/hooks'
import { CircleDetail } from './CircleDetail'
import {
  circleState,
  circleTone,
  type Circle,
  type CircleState,
  type Section,
} from '../../flashcards/path'
import { CheckIcon, ChevronIcon, LockIcon, PlayIcon } from '../icons'
import { useT } from '../../i18n/useT'
import type { Item } from '../../flashcards/types'
import type { Translate } from '../../i18n/t'

/** Units drawn when a section opens, and how many more a press adds. */
const WINDOW_UNITS = 3
const WINDOW_STEP = 5

export interface PathProps {
  sections: readonly Section[]
  /** Headword → card, built once for the whole path — see `circleState`. */
  deck: ReadonlyMap<string, Item>
  /**
   * The circle the screen opens on: the first one you can run, else the one
   * nearest to opening. `waiting` decides which, and the aside's action relies
   * on this landing you in the same place it was pointing at.
   */
  focus: number
  /** Circles that became mastered since the last read — the screen's one animation. */
  won: ReadonlySet<number>
  toneOf: (word: string) => number | null
  /** Running a circle, or adding its missing words — both disable every press. */
  busy: boolean
  onStart: (circle: Circle) => void
  onAdd: (words: string[]) => void
}

function statusLabel(status: CircleState['status'], t: Translate): string {
  return t(`path.status.${status}`)
}

function CircleButton({
  circle,
  state,
  at,
  tone,
  selected,
  disabled,
  won,
  onSelect,
}: {
  circle: Circle
  state: CircleState
  /** Position within the unit, which is the only thing the sway reads. */
  at: number
  tone: number | null
  selected: boolean
  disabled: boolean
  won: boolean
  onSelect: () => void
}) {
  const { t } = useT()

  return (
    <button
      class={`circle ${state.status} ${selected ? 'on' : ''} ${won ? 'won' : ''}`}
      // Two indices and nothing else. `--at` is what swings the circle off
      // centre, `--tone` is what tints a finished one; both are read by one
      // rule in the stylesheet rather than by a number per circle.
      style={{ '--at': at, ...(tone !== null ? { '--tone': `var(--tone-${tone})` } : {}) }}
      aria-pressed={selected}
      disabled={disabled}
      title={t('path.circleWords', { from: circle.from, to: circle.to })}
      aria-label={t('path.circleLabel', {
        from: circle.from,
        to: circle.to,
        status: statusLabel(state.status, t),
      })}
      onClick={onSelect}
    >
      {state.status === 'locked' ? (
        <>
          <LockIcon />
          <span class="circle-met">
            {state.met}/{circle.words.length}
          </span>
        </>
      ) : state.status === 'ready' ? (
        <PlayIcon />
      ) : (
        <CheckIcon />
      )}
    </button>
  )
}

export function Path({ sections, deck, focus, won, toneOf, busy, onStart, onAdd }: PathProps) {
  const { t } = useT()

  const [open, setOpen] = useState<number>(() => sectionOf(sections, focus))
  const [selected, setSelected] = useState<number>(focus)
  // Per section, because opening a different one should not inherit how far you
  // scrolled through the last.
  const [windows, setWindows] = useState<Record<number, { from: number; to: number }>>({})

  const windowFor = (section: Section) => {
    const saved = windows[section.index]
    if (saved) return saved
    const unit = Math.max(0, unitOf(section, focus))
    const from = Math.max(0, unit - 1)
    return { from, to: from + WINDOW_UNITS }
  }

  const widen = (section: Section, by: { from?: number; to?: number }) => {
    const now = windowFor(section)
    setWindows((all) => ({
      ...all,
      [section.index]: {
        from: Math.max(0, now.from + (by.from ?? 0)),
        to: Math.min(section.units.length, now.to + (by.to ?? 0)),
      },
    }))
  }

  return (
    <div class="path">
      {sections.map((section) => {
        const circles = section.units.flatMap((unit) => unit.circles)
        const done = circles.filter(
          (circle) => circleState(circle, deck).status === 'mastered',
        ).length
        const shown = windowFor(section)
        const isOpen = open === section.index

        return (
          <section class={isOpen ? 'path-section open' : 'path-section'} key={section.index}>
            <button
              class="path-head"
              aria-expanded={isOpen}
              onClick={() => setOpen(isOpen ? -1 : section.index)}
            >
              <span class="path-head-name">
                {section.name ?? t('path.section', { n: section.index + 1 })}
              </span>
              <span class="muted small">
                {t('path.sectionProgress', { done, total: circles.length })}
              </span>
              <ChevronIcon />
            </button>

            {isOpen && (
              <div class="path-units">
                {shown.from > 0 && (
                  <button class="ghost wide" onClick={() => widen(section, { from: -WINDOW_STEP })}>
                    {t('path.earlier')}
                  </button>
                )}

                {section.units.slice(shown.from, shown.to).map((unit) => (
                  <div class="path-unit" key={unit.index}>
                    <div class="path-unit-head">
                      <b>{t('path.unit', { n: unit.index + 1 })}</b>
                      <span class="muted small">
                        {t('path.circleWords', {
                          from: unit.circles[0].from,
                          to: unit.circles[unit.circles.length - 1].to,
                        })}
                      </span>
                    </div>

                    <div class="path-circles">
                      {unit.circles.map((circle, at) => {
                        const state = circleState(circle, deck)
                        return (
                          <CircleButton
                            key={circle.index}
                            circle={circle}
                            state={state}
                            at={at}
                            tone={
                              state.status === 'taken' || state.status === 'mastered'
                                ? circleTone(circle.words, toneOf)
                                : null
                            }
                            selected={selected === circle.index}
                            disabled={busy}
                            won={won.has(circle.index)}
                            onSelect={() =>
                              setSelected((was) => (was === circle.index ? -1 : circle.index))
                            }
                          />
                        )
                      })}
                    </div>

                    {unit.circles.some((circle) => circle.index === selected) && (
                      <CircleDetail
                        circle={unit.circles.find((circle) => circle.index === selected)!}
                        deck={deck}
                        busy={busy}
                        onStart={onStart}
                        onAdd={onAdd}
                      />
                    )}
                  </div>
                ))}

                {shown.to < section.units.length && (
                  <button class="ghost wide" onClick={() => widen(section, { to: WINDOW_STEP })}>
                    {t('path.more', { count: section.units.length - shown.to })}
                  </button>
                )}
              </div>
            )}
          </section>
        )
      })}

      <p class="muted small path-foot">{t('path.foot', { count: countWords(sections) })}</p>
    </div>
  )
}

function sectionOf(sections: readonly Section[], circle: number): number {
  for (const section of sections) {
    if (section.units.some((unit) => unit.circles.some((c) => c.index === circle))) {
      return section.index
    }
  }
  return sections[0]?.index ?? -1
}

function unitOf(section: Section, circle: number): number {
  return section.units.findIndex((unit) => unit.circles.some((c) => c.index === circle))
}

function countWords(sections: readonly Section[]): number {
  let n = 0
  for (const section of sections) {
    for (const unit of section.units) for (const circle of unit.circles) n += circle.words.length
  }
  return n
}
