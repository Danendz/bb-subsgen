// A study session, from the first card to the summary.
//
// Two answers, never four. The screen asks one question — did you get it —
// because a second decision on every card is what makes a review feel like
// filing rather than practising. What that costs the scheduler is made up on
// the ladder in scheduler.ts, where the level, not an ease factor, is the state.

import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { applyReview } from '../../background/flashcards-store'
import { hanWords } from '../../flashcards/capture'
import { chooseTarget, clozeOf } from '../../flashcards/cloze'
import { exerciseFor } from '../../flashcards/exercise'
import { LADDER, levelOf, MAX_LEVEL } from '../../flashcards/scheduler'
import { Pips } from '../mastery'
import { answerOf, buildBank, isCorrect, seedFor } from '../../flashcards/wordbank'
import { segment } from '../../lang/segment'
import { parseDefinitions } from '../../lang/definitions'
import { rankEntries } from '../../lang/entries'
import { lookupDefs } from '../../shared/dict-client'
import type { Context, Grade, Item, StudyMode } from '../../flashcards/types'
import { useAsync } from '../hooks'
import { canSpeak, speak } from '../speak'
import { WordBank } from './WordBank'
import { dominantTone, Pinyin } from '../pinyin'

/** Rewind, so the jump-back lands before the line rather than on top of it. */
const REWIND_S = 10

/** Wrong tiles mixed into a bank, so a short line cannot be solved by elimination. */
const DISTRACTORS = 3

/**
 * Where to watch this line again.
 *
 * `bbq=1` asks the content script to hold translations back for that visit —
 * arriving at the answer with the answer already on screen would defeat the
 * point of coming.
 */
function contextUrl(context: Context): string | null {
  if (!context.bvid || context.start === undefined) return null
  const at = Math.max(0, Math.floor(context.start) - REWIND_S)
  return `https://www.bilibili.com/video/${context.bvid}/?t=${at}&bbq=1`
}

function timestamp(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

export interface SessionProps {
  queue: Item[]
  words: Map<string, string>
  known: Set<string>
  /** Known words, as an array, to draw distractor tiles from. */
  distractorPool: string[]
  mode: StudyMode
  onFinish: () => void
}

export function Session({ queue: initial, words, known, distractorPool, mode, onFinish }: SessionProps) {
  const [queue, setQueue] = useState<Item[]>(initial)
  const [at, setAt] = useState(0)
  const [checked, setChecked] = useState(false)
  const [placed, setPlaced] = useState<number[]>([])
  const [typed, setTyped] = useState('')
  const [typingEscape, setTypingEscape] = useState(false)
  const [outcome, setOutcome] = useState<{ right: boolean; from: number; to: number } | null>(null)

  const [right, setRight] = useState(0)
  const [combo, setCombo] = useState(0)
  const [best, setBest] = useState(0)
  const [tones, setTones] = useState<number[]>([])

  const total = initial.length
  const current = queue[at] ?? null
  const inputRef = useRef<HTMLInputElement | null>(null)

  const loadDefs = useCallback(
    () => lookupDefs(current && current.kind === 'word' ? [current.text] : []),
    [current?.text],
  )
  const { data: defs } = useAsync(loadDefs)

  const card = useMemo(() => {
    if (!current) return null

    const context = current.contexts[current.contexts.length - 1]
    const translation = context?.translation ?? ''
    const tokens = segment(current.text, words)
    const target =
      current.kind === 'sentence'
        ? chooseTarget(hanWords(tokens), known, current.target)
        : null

    const exercise = exerciseFor(current, mode, {
      canSpeak: canSpeak(),
      hasTranslation: Boolean(translation),
      hasTarget: Boolean(target),
    })

    // A clozed line asks for the one missing word; everything else asks for the
    // whole line.
    const answer = exercise.cue === 'cloze' && target ? [target] : answerOf(tokens)
    const seed = seedFor(current.id, current.reps)
    // Sampled by index rather than by shuffling the pool: the known set runs to
    // thousands of words, and copying all of them to take three would be the
    // most expensive thing on the screen.
    const distractors = distractorPool.length
      ? Array.from(
          { length: DISTRACTORS },
          (_, i) => distractorPool[(seed + i * 7919) % distractorPool.length],
        )
      : []
    const bank = exercise.response === 'tiles' ? buildBank(answer, distractors, seed) : null

    return { context, translation, tokens, target, exercise, answer, bank }
  }, [current?.id, current?.reps, words, known, distractorPool, mode])

  // Speaking is the question on a listening card, so it has to happen on its own
  // rather than waiting for a button that would give the answer away.
  useEffect(() => {
    if (card?.exercise.autoSpeak && current && !checked) speak(current.text)
  }, [current?.id, card?.exercise.autoSpeak, checked])

  useEffect(() => {
    if (!checked && card?.exercise.response === 'text') inputRef.current?.focus()
  }, [current?.id, checked, card?.exercise.response])

  const entries = defs?.[current?.text ?? '']
  const [primary] = rankEntries(entries ?? [], current?.text ?? '')
  const gloss = primary
    ? parseDefinitions(primary.definitions).definitions.slice(0, 3).join('; ')
    : ''

  const answered =
    card?.exercise.response === 'tiles'
      ? placed.length > 0
      : card?.exercise.response === 'text'
        ? typed.trim().length > 0
        : true

  /** Whether what the user gave back matches the card. Recall cards have nothing to check. */
  const correct = (() => {
    if (!card || !current) return false
    if (card.exercise.response === 'tiles') {
      if (typingEscape) return typed.trim() === card.answer.join('')
      return isCorrect(
        placed.map((i) => card.bank!.tiles[i]),
        card.answer,
      )
    }
    if (card.exercise.response === 'text') {
      const attempt = typed.trim()
      return (
        attempt === current.text ||
        Boolean(primary && (attempt === primary.simplified || attempt === primary.traditional))
      )
    }
    return false
  })()

  /** What the user actually gave back, for the verdict to quote. */
  const attempt =
    card?.exercise.response === 'tiles' && !typingEscape
      ? placed.map((i) => card.bank!.tiles[i]).join('')
      : typed.trim()

  const reset = () => {
    setChecked(false)
    setPlaced([])
    setTyped('')
    setTypingEscape(false)
    setOutcome(null)
  }

  const settle = async (wasRight: boolean) => {
    // Guards a second Enter landing before the first has finished: the review is
    // already written, and grading the same card twice would move it two rungs.
    if (!current || !card || outcome) return
    const grade: Grade = wasRight ? 'good' : 'again'
    const from = levelOf(current)
    const next = await applyReview(current, grade, card.exercise.style)

    setOutcome({ right: wasRight, from, to: levelOf(next) })

    if (wasRight) {
      const run = combo + 1
      setRight((n) => n + 1)
      setCombo(run)
      setBest(Math.max(best, run))
      setTones((list) => [...list, dominantTone(current.text, words)])
    } else {
      setCombo(0)
      // A forgotten card returns in the same sitting — that is the whole point
      // of getting it wrong — so it goes to the back of the queue rather than
      // out of it. It does not change the denominator: the session promised a
      // number of cards, not a number of answers.
      setQueue((q) => [...q, next])
    }
  }

  const advance = () => {
    reset()
    setAt((i) => i + 1)
  }

  const check = () => {
    if (checked || !card) return
    if (card.exercise.response === 'reveal') {
      setChecked(true)
      return
    }
    if (!answered) return
    setChecked(true)
    void settle(correct)
  }

  const place = (index: number) => {
    if (checked) return
    setPlaced((list) => (list.includes(index) ? list : [...list, index]))
  }

  const remove = (position: number) => {
    if (checked) return
    setPlaced((list) => list.filter((_, i) => i !== position))
  }

  // Declared alongside the buttons since the buttons were written, and never
  // wired up until now.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.isComposing || !card) return
      const target = e.target as HTMLElement | null
      const typingHere = target?.tagName === 'INPUT'

      if (e.key === 'Enter') {
        e.preventDefault()
        if (!checked) check()
        else if (card.exercise.response !== 'reveal') advance()
        else if (!outcome) void settle(true).then(advance)
        return
      }

      if (checked && card.exercise.response === 'reveal' && !outcome) {
        if (e.key === '1') void settle(false).then(advance)
        if (e.key === '2') void settle(true).then(advance)
        return
      }

      if (typingHere || checked) return

      if (card.exercise.response === 'tiles' && !typingEscape) {
        if (e.key === 'Backspace' && placed.length) {
          e.preventDefault()
          remove(placed.length - 1)
          return
        }
        const digit = Number(e.key)
        if (Number.isInteger(digit) && digit >= 1 && digit <= (card.bank?.tiles.length ?? 0)) {
          e.preventDefault()
          place(digit - 1)
        }
      }
    }

    addEventListener('keydown', onKeyDown)
    return () => removeEventListener('keydown', onKeyDown)
  }, [card, checked, placed, typingEscape, answered, correct, outcome])

  if (!current || !card) {
    return (
      <div class="panel done">
        <p class="done-title">Session complete</p>
        <ToneBar tones={tones} total={total} />
        <div class="summary">
          <span>
            <b>{total}</b> cards
          </span>
          <span>
            <b>{right}</b> right first time
          </span>
          <span>
            <b>{best}</b> best run
          </span>
        </div>
        <button class="primary" onClick={onFinish}>
          Done
        </button>
      </div>
    )
  }

  const { exercise, context, translation, target, bank } = card
  const cloze = target ? clozeOf(current.text, target) : null
  const pinyin = primary?.pinyin ?? ''

  return (
    <>
      <div class="hud">
        <button class="ghost" onClick={onFinish}>
          End session
        </button>
        <ToneBar tones={tones} total={total} />
        <span class={`combo ${combo >= 3 ? 'hot' : ''}`}>
          {combo >= 3 ? `${combo} in a row` : `${right} / ${total}`}
        </span>
      </div>

      {/* Only once there is a verdict. A recall card is revealed before it is
          graded, and colouring it red in that gap prejudges an answer the user
          has not given yet. */}
      <div class={`panel card ${outcome ? (outcome.right ? 'right' : 'wrong') : ''}`}>
        <p class="task">{taskLabel(exercise.cue, current.kind)}</p>

        {exercise.cue === 'audio' ? (
          <div class="prompt">
            <button class="speak big" onClick={() => speak(current.text)}>
              <span aria-hidden="true">♪</span> Play again
            </button>
          </div>
        ) : exercise.cue === 'gloss' ? (
          <div class="prompt">
            <p class="gloss-prompt">{gloss || '(no definition)'}</p>
          </div>
        ) : exercise.cue === 'translation' ? (
          <div class="prompt">
            <p class="translation-prompt">{translation}</p>
          </div>
        ) : exercise.cue === 'cloze' && cloze ? (
          <div class="prompt">
            <p class="hanzi-line">
              {cloze.before}
              <span class="blank">{'　'.repeat(Math.max(1, cloze.blank.length))}</span>
              {cloze.after}
            </p>
            <button class="speak" onClick={() => speak(current.text)}>
              <span aria-hidden="true">♪</span> Play again
            </button>
          </div>
        ) : (
          <div class="prompt">
            <p class={current.kind === 'word' ? 'hanzi-xl' : 'hanzi-line'}>{current.text}</p>
          </div>
        )}

        {exercise.response === 'tiles' && bank && !typingEscape && (
          <WordBank
            tiles={bank.tiles}
            placed={placed}
            disabled={checked}
            onPlace={place}
            onRemove={remove}
          />
        )}

        {exercise.response === 'tiles' && typingEscape && (
          <input
            ref={inputRef}
            type="text"
            class="answer-input"
            value={typed}
            placeholder="Type the line…"
            disabled={checked}
            onInput={(e) => setTyped(e.currentTarget.value)}
          />
        )}

        {exercise.response === 'text' && (
          <input
            ref={inputRef}
            type="text"
            class="answer-input"
            value={typed}
            placeholder="Type the characters…"
            disabled={checked}
            onInput={(e) => setTyped(e.currentTarget.value)}
          />
        )}

        {exercise.response === 'tiles' && !checked && (
          <button class="link-btn" onClick={() => setTypingEscape((on) => !on)}>
            {typingEscape ? 'Use the word bank' : 'Type it instead'}
          </button>
        )}

        {checked && (
          <div class="reveal">
            {/* The answer itself is right underneath, so the verdict reports
                what you did instead — seeing your own wrong version next to the
                right one is the part that teaches. */}
            {outcome && exercise.response !== 'reveal' && (
              <p class={`verdict ${outcome.right ? 'ok' : 'no'}`}>
                {outcome.right
                  ? 'Correct'
                  : attempt
                    ? `Not quite — you put ${attempt}`
                    : 'Not quite'}
              </p>
            )}

            {/* The characters are the answer only when they were not the
                question. Repeating them under a prompt that already showed them
                just makes the card say the same thing twice. */}
            {exercise.cue !== 'hanzi' && <p class="answer-hanzi">{current.text}</p>}
            {pinyin && <Pinyin pinyin={pinyin} />}
            {/* Same rule as the characters above: the meaning is worth showing
                unless the meaning was the question. */}
            {current.kind === 'word'
              ? exercise.cue !== 'gloss' && <p class="meaning">{gloss || 'No definition found'}</p>
              : exercise.cue !== 'translation' && translation && (
                  <p class="meaning">{translation}</p>
                )}

            {canSpeak() && (
              <button class="speak" onClick={() => speak(current.text)}>
                <span aria-hidden="true">♪</span> Listen
              </button>
            )}

            {outcome && <Mastery from={outcome.from} to={outcome.to} />}

            {current.kind === 'word' && context && (
              <div class="context">
                <p class="hanzi-line">{context.text}</p>
                {context.translation && <p class="muted small">{context.translation}</p>}
              </div>
            )}

            {context && contextUrl(context) && (
              <p class="small">
                <a href={contextUrl(context)!} target="_blank" rel="noreferrer">
                  Watch it again from {timestamp(Math.max(0, (context.start ?? 0) - REWIND_S))}
                </a>{' '}
                <span class="muted">— translations stay hidden</span>
              </p>
            )}
          </div>
        )}
      </div>

      <div class="actions">
        {!checked ? (
          <button class="primary" disabled={!answered} onClick={check}>
            {exercise.response === 'reveal' ? 'Show answer' : 'Check'}
          </button>
        ) : exercise.response === 'reveal' && !outcome ? (
          <>
            <button class="wrong-btn" onClick={() => void settle(false).then(advance)}>
              I didn’t know it
            </button>
            <button class="right-btn" onClick={() => void settle(true).then(advance)}>
              I knew it
            </button>
          </>
        ) : (
          <button class="primary" onClick={advance}>
            Continue
          </button>
        )}
      </div>
    </>
  )
}

function taskLabel(cue: string, kind: Item['kind']): string {
  if (cue === 'audio') return kind === 'word' ? 'Type what you hear' : 'Build what you hear'
  if (cue === 'gloss') return 'Type the characters'
  if (cue === 'translation') return 'Build this line in Chinese'
  if (cue === 'cloze') return 'Which word is missing?'
  return kind === 'word' ? 'What does this mean?' : 'What does this line mean?'
}

/**
 * The session's progress, one segment per card settled, tinted by that card's
 * first tone.
 *
 * It only ever fills: a card you got wrong comes back, but it never takes a
 * segment away, because the session promised a number of cards rather than a
 * number of answers.
 */
function ToneBar({ tones, total }: { tones: number[]; total: number }) {
  return (
    <div
      class="tonebar"
      role="progressbar"
      aria-valuenow={tones.length}
      aria-valuemin={0}
      aria-valuemax={total}
      aria-label="Cards settled"
    >
      {Array.from({ length: total }, (_, i) => (
        <span key={i} class={`seg ${i < tones.length ? `t${tones[i]}` : ''}`} />
      ))}
    </div>
  )
}

/** Where the card sits on the ladder, and which way it just moved. */
function Mastery({ from, to }: { from: number; to: number }) {
  const days = LADDER[to]
  return (
    <div class={`mastery ${to > from ? 'up' : to < from ? 'down' : ''}`}>
      <Pips level={to} lost={to < from} />
      <span class="small muted">
        {to === MAX_LEVEL
          ? 'Mastered'
          : days === 0
            ? 'Back in a few minutes'
            : `Back in ${days} day${days === 1 ? '' : 's'}`}
      </span>
    </div>
  )
}
