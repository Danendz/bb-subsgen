// A study session, from the first card to the summary.
//
// Two answers, never four. The screen asks one question — did you get it —
// because a second decision on every card is what makes a review feel like
// filing rather than practising. What that costs the scheduler is made up on
// the ladder in scheduler.ts, where the level, not an ease factor, is the state.

import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { applyReview } from '../../background/flashcards-store'
import { vocabularyIn } from '../../flashcards/capture'
import { chooseTarget } from '../../flashcards/cloze'
import { exerciseFor } from '../../flashcards/exercise'
import { DAY_MS, levelOf, MAX_LEVEL, reschedules } from '../../flashcards/scheduler'
import { Pips } from '../mastery'
import { PATTERNS } from '../../lang/zh/grammar/patterns'
import { answerOf, buildBank, isCorrect, seedFor } from '../../flashcards/wordbank'
import { findPatterns, type PatternMatch } from '../../lang/zh/grammar/match'
import type { Pattern } from '../../lang/zh/grammar/patterns'
import { parseDefinitions } from '../../lang/zh/definitions'
import { isEpisodeId } from '../../bilibili/resolve'
import { bareId, isYoutubeId } from '../../youtube/site'
import { rankEntries } from '../../lang/zh/entries'
import type { Lexicon } from '../../lang/pack'
import { lookupDefs } from '../../shared/dict-client'
import type { Context, Grade, Item, StudyMode } from '../../flashcards/types'
import { useAsync } from '../hooks'
import { canSpeak, speak } from '../../shared/speak'
import { loadSettings, resolveStudyLang } from '../../shared/settings'
import { WordBank } from './WordBank'
import { Line } from './Line'
import { dominantTone, Pinyin } from '../pinyin'
import { ChatDrawer } from '../chat/ChatDrawer'
import { explainQuestion, openExplainChat } from '../chat/explain'

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
 *
 * Built on the URL capture stored rather than reassembled from the id, because
 * the stored one is the page that actually worked: it already carries the part
 * number of a multi-part video, which reassembly dropped, and it is the only
 * thing that knows a bangumi episode does not live under `/video/`.
 */
function contextUrl(context: Context): string | null {
  if (!context.videoId || context.start === undefined) return null

  const base = context.url ?? watchUrlFor(context.videoId)
  const at = Math.max(0, Math.floor(context.start) - REWIND_S)

  try {
    const url = new URL(base)
    url.searchParams.set('t', String(at))
    url.searchParams.set('bbq', '1')
    return url.toString()
  } catch {
    return null
  }
}

/**
 * The fallback for rows captured before the URL was stored alongside them.
 *
 * Those rows are all Bilibili's — they predate every other site — but the check
 * is explicit anyway, because `isEpisodeId` asks whether an id starts with `ep`
 * and `ep1234ABCDE` is a perfectly legal YouTube id. The `yt:` prefix is what
 * keeps the two apart; this is where forgetting it would send you to a bangumi
 * page that does not exist.
 */
function watchUrlFor(videoId: string): string {
  if (isYoutubeId(videoId)) return `https://www.youtube.com/watch?v=${bareId(videoId)}`
  return isEpisodeId(videoId)
    ? `https://www.bilibili.com/bangumi/play/${videoId}`
    : `https://www.bilibili.com/video/${videoId}/`
}

function timestamp(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

export interface SessionProps {
  queue: Item[]
  /**
   * Ids drawn as practice rather than owed. Getting one right does not move it —
   * see `reschedules` — so the card has to know which it is before it grades.
   */
  extra: Set<string>
  words: Lexicon
  known: Set<string>
  /** Known words, as an array, to draw distractor tiles from. */
  distractorPool: string[]
  mode: StudyMode
  onFinish: () => void
}

function distinctPatterns(matches: PatternMatch[]): Pattern[] {
  const seen = new Set<string>()
  return matches.flatMap(({ pattern }) => {
    if (seen.has(pattern.id)) return []
    seen.add(pattern.id)
    return [pattern]
  })
}

export function Session({
  queue: initial,
  extra: drawnAsExtra,
  words,
  known,
  distractorPool,
  mode,
  onFinish,
}: SessionProps) {
  const [queue, setQueue] = useState<Item[]>(initial)
  // Held as state because failing a practice card takes it out: it has lapsed,
  // so it is owed now, and the retry it earns inside this sitting has to count
  // the way a scheduled card's does.
  const [extra, setExtra] = useState<Set<string>>(drawnAsExtra)
  const [at, setAt] = useState(0)
  const [checked, setChecked] = useState(false)
  const [placed, setPlaced] = useState<number[]>([])
  const [typed, setTyped] = useState('')
  const [typingEscape, setTypingEscape] = useState(false)
  const [outcome, setOutcome] = useState<{
    right: boolean
    from: number
    to: number
    /** The card's due date after grading, which practice leaves where it was. */
    due: number
    /** Whether the answer was allowed to move the card at all. */
    counted: boolean
  } | null>(null)

  const [right, setRight] = useState(0)
  const [combo, setCombo] = useState(0)
  const [best, setBest] = useState(0)
  const [tones, setTones] = useState<number[]>([])

  // The explanation opens over the session rather than instead of it. `opening`
  // covers the moment the track is being fetched, which is the slow part.
  const [explaining, setExplaining] = useState<{ chatId: string; question: string } | null>(null)
  const [opening, setOpening] = useState(false)
  const [llmReady, setLlmReady] = useState(false)

  useEffect(() => {
    void loadSettings().then((s) => setLlmReady(s.llmEnabled && Boolean(s.llmBaseUrl)))
  }, [])

  const total = initial.length
  const current = queue[at] ?? null
  const inputRef = useRef<HTMLInputElement | null>(null)

  // The Chinese line this card puts on screen: a word's example, or the
  // sentence itself. Named here because both the definitions and the renderer
  // need it, and because for a word card it is not the card's own text.
  // A grammar card is the same shape as a word card here: its own `text` is a
  // skeleton, not Chinese, so the line it shows has to come from an example.
  const line =
    current === null
      ? ''
      : current.kind === 'sentence'
        ? current.text
        : (current.contexts[current.contexts.length - 1]?.text ?? '')

  // Every word on screen, in one batched round trip. A lookup per word would be
  // a message per word, and the line is known in full before it is rendered.
  const headwords = useMemo(
    () => [
      ...new Set([
        ...(current?.kind === 'word' ? [current.text] : []),
        ...vocabularyIn(words.segment(line)),
      ]),
    ],
    [current?.id, line, words],
  )

  const loadDefs = useCallback(
    async () => lookupDefs(resolveStudyLang(await loadSettings()), headwords),
    [headwords.join('|')],
  )
  const { data: defs } = useAsync(loadDefs)

  const card = useMemo(() => {
    if (!current) return null

    const context = current.contexts[current.contexts.length - 1]
    const translation = context?.translation ?? ''
    // Segmented from the example for a grammar card — `current.text` is the
    // skeleton, which is not a sentence and has no tiles in it.
    const exampleText = current.kind === 'grammar' ? (context?.text ?? '') : current.text
    const tokens = words.segment(exampleText)
    const target =
      current.kind === 'sentence' ? chooseTarget(vocabularyIn(tokens), known, current.target) : null

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

    // Only lines have structure worth naming. A word card's example lives in
    // its context, not in `text`, so there is nothing here to match against.
    // Spans are dropped here: the reveal names the structures, it does not
    // underline them, so one entry per distinct pattern is what it wants.
    const patterns = current.kind === 'sentence' ? distinctPatterns(findPatterns(tokens)) : []

    return { context, translation, tokens, target, exercise, answer, bank, patterns, exampleText }
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
    const drilled = extra.has(current.id)
    const next = await applyReview(current, grade, card.exercise.style, Date.now(), drilled)

    setOutcome({
      right: wasRight,
      from,
      to: levelOf(next),
      due: next.due,
      counted: reschedules({ grade, extra: drilled }),
    })

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
      // And it comes back as an ordinary card. It has lapsed, which means it is
      // owed rather than optional, so getting it right this time counts.
      if (drilled) {
        setExtra((ids) => {
          const rest = new Set(ids)
          rest.delete(current.id)
          return rest
        })
      }
    }
  }

  const advance = () => {
    reset()
    setAt((i) => i + 1)
  }

  /**
   * Opens an explanation of the line this card came from.
   *
   * The card is not graded, not advanced and not unmounted — the drawer sits
   * over the session and closing it puts you back on the same card.
   */
  const explain = async () => {
    const context = card?.context
    if (!current || !context?.text || opening) return

    setOpening(true)
    try {
      const chatId = await openExplainChat({
        line: context.text,
        // A sentence or grammar card is a question about the whole line; only a
        // word card has a word to single out.
        ...(current.kind === 'word' ? { target: current.text } : {}),
        ...(context.videoId !== undefined ? { videoId: context.videoId } : {}),
        ...(context.start !== undefined ? { start: context.start } : {}),
        ...(context.title !== undefined ? { sourceTitle: context.title } : {}),
        itemId: current.id,
      })
      setExplaining({
        chatId,
        question: explainQuestion(current.kind === 'word' ? current.text : undefined),
      })
    } catch (e) {
      console.warn('[bb-subsgen] could not open an explanation', e)
    } finally {
      setOpening(false)
    }
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

  const { exercise, context, translation, target, bank, patterns, exampleText } = card
  // The card's own pattern, as opposed to `patterns`, which is everything the
  // example line happens to contain.
  const ownPattern = PATTERNS.find((p) => p.id === current.patternId)
  const spokenText = current.kind === 'grammar' ? exampleText : current.text
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
        <p class="task">{taskLabel(exercise.cue, current.kind, exercise.response)}</p>

        {exercise.cue === 'pattern' ? (
          <div class="prompt">
            <p class="hanzi-xl">{current.text}</p>
            {ownPattern && <p class="gloss-prompt">{ownPattern.name}</p>}
            {/* In production mode the translation is the question: build the
                line that says this, using the shape above. */}
            {exercise.response === 'tiles' && translation && (
              <p class="translation-prompt">{translation}</p>
            )}
          </div>
        ) : exercise.cue === 'audio' ? (
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
        ) : exercise.cue === 'cloze' && target ? (
          <div class="prompt">
            <p class="hanzi-line">
              <Line text={current.text} words={words} known={known} defs={defs} blank={target} />
            </p>
            <button class="speak" onClick={() => speak(current.text)}>
              <span aria-hidden="true">♪</span> Play again
            </button>
          </div>
        ) : (
          <div class="prompt">
            {/* A question shows the characters and nothing else; the reading and
                the meaning are there to be asked for, not volunteered. */}
            <p class={current.kind === 'word' ? 'hanzi-xl' : 'hanzi-line'}>
              {current.kind === 'word' ? (
                current.text
              ) : (
                <Line text={current.text} words={words} known={known} defs={defs} />
              )}
            </p>
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

            {/* A grammar card's answer is what the shape does, shown with the
                line it was met in — the explanation alone is a definition, and
                the example is what makes it stick. */}
            {current.kind === 'grammar' && ownPattern && (
              <>
                <p class="meaning">{ownPattern.explanation}</p>
                {exampleText && (
                  <p class="answer-hanzi">
                    <Line text={exampleText} words={words} known={known} defs={defs} readings />
                  </p>
                )}
                {translation && <p class="context">{translation}</p>}
              </>
            )}

            {/* The characters are the answer only when they were not the
                question. Repeating them under a prompt that already showed them
                just makes the card say the same thing twice. */}
            {current.kind !== 'grammar' && exercise.cue !== 'hanzi' && (
              <p class="answer-hanzi">
                {current.kind === 'word' ? (
                  current.text
                ) : (
                  <Line text={current.text} words={words} known={known} defs={defs} readings />
                )}
              </p>
            )}
            {pinyin && <Pinyin pinyin={pinyin} />}
            {/* Same rule as the characters above: the meaning is worth showing
                unless the meaning was the question. */}
            {current.kind === 'word'
              ? exercise.cue !== 'gloss' && <p class="meaning">{gloss || 'No definition found'}</p>
              : current.kind === 'sentence'
                ? exercise.cue !== 'translation' &&
                  translation && <p class="meaning">{translation}</p>
                : null}

            {/* Why the line means what it means. Only on the answer side, and
                only for a line — a single word has no structure to explain, and
                on the question side this would give the answer away. */}
            {patterns.length > 0 && (
              <div class="structure">
                <p class="structure-label">Structure</p>
                {patterns.map((pattern) => (
                  <div class="pattern" key={pattern.id}>
                    <p class="pattern-head">
                      <span class="pattern-skeleton">{pattern.skeleton}</span>
                      <span class="pattern-name">{pattern.name}</span>
                    </p>
                    <p class="pattern-explanation">{pattern.explanation}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Speaks the Chinese that is actually on screen. A grammar card's
                own text is a skeleton — reading "V + 得 + how" aloud would be
                nonsense — so it offers its example instead, or nothing. */}
            {canSpeak() && spokenText && (
              <button class="speak" onClick={() => speak(spokenText)}>
                <span aria-hidden="true">♪</span> Listen
              </button>
            )}

            {outcome && (
              <Mastery
                from={outcome.from}
                to={outcome.to}
                due={outcome.due}
                counted={outcome.counted}
              />
            )}

            {current.kind === 'word' && context && (
              <div class="context">
                <p class="hanzi-line">
                  <Line
                    text={context.text}
                    words={words}
                    known={known}
                    defs={defs}
                    mark={current.text}
                    readings
                  />
                </p>
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

            {/* Said plainly rather than hidden behind an icon. This video had no
                subtitles, so the Chinese above is a speech model's guess at what
                was said — and a homophone it got wrong is indistinguishable from
                a word you simply do not know yet, which is precisely the
                confusion worth heading off before you try to learn it. */}
            {context?.source === 'asr' && (
              <p class="small muted">Transcribed from the audio — this line may be misheard.</p>
            )}

            {/* Only offered when a model is actually configured: a button that
                explains why it cannot work is worse than no button. */}
            {llmReady && context?.text && (
              <p class="small">
                <button class="link-btn" disabled={opening} onClick={() => void explain()}>
                  {opening ? 'Reading the scene…' : 'Explain this line'}
                </button>
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

      {explaining && (
        <ChatDrawer
          chatId={explaining.chatId}
          autoAsk={explaining.question}
          fullHref={`#/chat/${explaining.chatId}`}
          onClose={() => setExplaining(null)}
        />
      )}
    </>
  )
}

function taskLabel(cue: string, kind: Item['kind'], response: string): string {
  if (cue === 'pattern') {
    return response === 'tiles' ? 'Build this line using the shape' : 'What does this shape do?'
  }
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

/**
 * Where the card sits on the ladder, and which way it just moved.
 *
 * Reads the card's own due date rather than the rung's nominal spacing: a card
 * met as practice keeps whatever due date it already had, so quoting `LADDER[to]`
 * would announce 35 days on a card that is genuinely back in twelve.
 */
function Mastery({
  from,
  to,
  due,
  counted,
}: {
  from: number
  to: number
  due: number
  counted: boolean
}) {
  const days = Math.round((due - Date.now()) / DAY_MS)
  const when =
    to === MAX_LEVEL && counted
      ? 'Mastered'
      : days < 1
        ? 'Back in a few minutes'
        : `${counted ? 'Back' : 'Still due'} in ${days} day${days === 1 ? '' : 's'}`

  return (
    <div class={`mastery ${to > from ? 'up' : to < from ? 'down' : ''}`}>
      <Pips level={to} lost={to < from} />
      <span class="small muted">
        {/* Said plainly, because a card that gives no feedback about why it
            didn't move invites the question of whether the answer registered. */}
        {counted ? when : `Practice · ${when}`}
      </span>
    </div>
  )
}
