// What one circle says when you press it.
//
// Four states and four different offers, and the one that earns its place is
// `locked`. Video does not deal out frequency ranks evenly, so you will sit at
// seven of eight for a week — and without a way to fill the gap a single rare
// word blocks a circle indefinitely. So a locked circle names what is missing
// and offers to add it from the dictionary, through the same `discoverWord`
// message the reader uses.
//
// `taken` and `mastered` offer nothing to press on purpose. Learn adds and
// Review maintains: re-running a circle would be a second scheduler with its
// own idea of when a word is due.

import { masteryOf, Pips } from '../mastery'
import { circleState, type Circle } from '../../flashcards/path'
import { useT } from '../../i18n/useT'
import type { Item } from '../../flashcards/types'

export interface CircleDetailProps {
  circle: Circle
  deck: ReadonlyMap<string, Item>
  busy: boolean
  onStart: (circle: Circle) => void
  onAdd: (words: string[]) => void
}

export function CircleDetail({ circle, deck, busy, onStart, onAdd }: CircleDetailProps) {
  const { t } = useT()
  const state = circleState(circle, deck)

  return (
    <div class="panel circle-detail">
      <div class="row">
        <b class="grow">{t('path.circleWords', { from: circle.from, to: circle.to })}</b>
        <span class="muted small">
          {t('path.met', { met: state.met, total: circle.words.length })}
        </span>
      </div>

      {state.status === 'locked' ? (
        <>
          <p class="muted small">{t('path.lockedHint')}</p>
          <p class="circle-words">
            {state.missing.map((word) => (
              <span class="hanzi missing" key={word}>
                {word}
              </span>
            ))}
          </p>
          <button class="wide" disabled={busy} onClick={() => onAdd(state.missing)}>
            {busy ? t('path.adding') : t('path.add', { count: state.missing.length })}
          </button>
        </>
      ) : (
        <>
          <ul class="circle-list">
            {circle.words.map((word) => {
              const item = deck.get(word)
              return (
                <li key={word}>
                  <span class="hanzi grow">{word}</span>
                  {item && <Pips level={masteryOf(item)} compact />}
                </li>
              )
            })}
          </ul>

          {state.status === 'ready' ? (
            <>
              <p class="muted small">{t('path.readyHint', { count: circle.words.length })}</p>
              <button class="primary wide" disabled={busy} onClick={() => onStart(circle)}>
                {busy ? t('common.loading') : t('path.start')}
              </button>
            </>
          ) : (
            <p class="muted small">
              {state.status === 'mastered' ? t('path.masteredHint') : t('path.takenHint')}
            </p>
          )}
        </>
      )}
    </div>
  )
}
