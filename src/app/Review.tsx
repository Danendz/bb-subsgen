import { useCallback, useEffect, useMemo, useState } from 'preact/hooks'
import { flashcardsDb } from '../flashcards/db'
import { knownSetOf, listItems } from '../flashcards/queries'
import { buildQueue, queueCounts } from '../flashcards/queue'
import { chooseTarget, clozeOf } from '../flashcards/cloze'
import { hanWords, unknownIn } from '../flashcards/capture'
import { applyReview, rankMap } from '../background/flashcards-store'
import { segment } from '../lang/segment'
import { loadWords } from '../lang/dict'
import { lookupDefs } from '../shared/dict-client'
import { loadSettings } from '../shared/settings'
import { parseDefinitions } from '../lang/definitions'
import { rankEntries } from '../lang/entries'
import { toDiacriticPhrase } from '../lang/tone'
import type { Context, Grade, Item, ReviewStyle } from '../flashcards/types'
import { useAsync } from './hooks'
import { canSpeak, speak } from './speak'

const GRADES: Array<{ grade: Grade; label: string; key: string }> = [
  { grade: 'again', label: 'Again', key: '1' },
  { grade: 'hard', label: 'Hard', key: '2' },
  { grade: 'good', label: 'Good', key: '3' },
  { grade: 'easy', label: 'Easy', key: '4' },
]

/** Rewind, so the jump-back lands before the line rather than on top of it. */
const REWIND_S = 10

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
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

/**
 * How this card gets asked.
 *
 * Rotated off the review count rather than chosen at random, so a word is met
 * from a different angle each time instead of the same one three sittings
 * running. Audio drops out entirely on a machine with no Mandarin voice.
 */
function styleFor(item: Item, audio: boolean): ReviewStyle {
  if (item.kind === 'sentence') return 'cloze'
  const styles: ReviewStyle[] = audio ? ['recognise', 'type', 'audio'] : ['recognise', 'type']
  return styles[item.reps % styles.length]
}

export function Review() {
  const load = useCallback(async () => {
    const db = await flashcardsDb()
    const [items, words, settings, ranks] = await Promise.all([
      listItems(db),
      loadWords(),
      loadSettings(),
      rankMap(),
    ])
    return { items, words, settings, ranks, known: knownSetOf(items) }
  }, [])
  const { data, loading, reload } = useAsync(load)

  const [queue, setQueue] = useState<Item[] | null>(null)
  const [at, setAt] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [typed, setTyped] = useState('')
  const [done, setDone] = useState(0)

  const unknownCount = useCallback(
    (item: Item) =>
      data ? unknownIn(hanWords(segment(item.text, data.words)), data.known).length : 0,
    [data],
  )

  const rankOf = useCallback((headword: string) => data?.ranks.get(headword), [data])

  const counts = useMemo(
    () =>
      data
        ? queueCounts({
            items: data.items,
            now: Date.now(),
            newWordsPerDay: data.settings.newWordsPerDay,
            newSentencesPerDay: data.settings.newSentencesPerDay,
            unknownCount,
            rankOf,
          })
        : null,
    [data, unknownCount, rankOf],
  )

  const current = queue?.[at] ?? null

  // Only the word on screen, one round trip.
  const loadDefs = useCallback(
    () => lookupDefs(current && current.kind === 'word' ? [current.text] : []),
    [current?.text],
  )
  const { data: defs } = useAsync(loadDefs)

  const style = current && data ? styleFor(current, canSpeak()) : null

  // Speaking is the question for an audio card, so it has to happen on its own
  // rather than waiting for a button that would give the answer away.
  useEffect(() => {
    if (style === 'audio' && current && !revealed) speak(current.text)
  }, [current?.id, style, revealed])

  if (loading || !data || !counts) return <p class="muted">Loading…</p>

  const start = () => {
    setQueue(
      buildQueue({
        items: data.items,
        now: Date.now(),
        newWordsPerDay: data.settings.newWordsPerDay,
        newSentencesPerDay: data.settings.newSentencesPerDay,
        unknownCount,
        rankOf,
      }),
    )
    setAt(0)
    setDone(0)
    setRevealed(false)
    setTyped('')
  }

  const grade = async (chosen: Grade) => {
    if (!current) return
    const next = await applyReview(current, chosen, style ?? 'recognise')
    setDone((n) => n + 1)
    setRevealed(false)
    setTyped('')

    // A forgotten card returns in the same session — that is the whole point of
    // `again` — so it goes to the back of the queue rather than out of it.
    setQueue((q) => {
      if (!q) return q
      const rest = [...q]
      if (chosen === 'again') rest.push(next)
      return rest
    })
    setAt((i) => i + 1)
  }

  if (!queue) {
    const total = counts.due + counts.newWords + counts.newSentences
    return (
      <>
        <div class="stats">
          <div class="panel stat">
            <span class="n">{counts.due}</span>
            <span class="label">due for review</span>
          </div>
          <div class="panel stat">
            <span class="n">{counts.newWords}</span>
            <span class="label">new words today</span>
          </div>
          <div class="panel stat">
            <span class="n">{counts.newSentences}</span>
            <span class="label">new sentences today</span>
          </div>
          <div class="panel stat">
            <span class="n">{counts.pooled}</span>
            <span class="label">waiting in the pool</span>
          </div>
        </div>

        {total > 0 ? (
          <p>
            <button class="primary" onClick={start}>
              Study {total} card{total === 1 ? '' : 's'}
            </button>
          </p>
        ) : (
          <div class="empty">
            <p>Nothing due.</p>
            <p class="small">
              {counts.pooled > 0
                ? `${counts.pooled} sentences are waiting their turn — they are let in a few a day, easiest first.`
                : 'Go and read something; whatever you look up will show up here.'}
            </p>
          </div>
        )}
      </>
    )
  }

  if (!current) {
    return (
      <div class="empty">
        <p>Done — {done} card{done === 1 ? '' : 's'} reviewed.</p>
        <p>
          <button
            onClick={() => {
              setQueue(null)
              reload()
            }}
          >
            Back
          </button>
        </p>
      </div>
    )
  }

  const entries = defs?.[current.text]
  const [primary] = rankEntries(entries ?? [], current.text)
  const pinyin = primary ? toDiacriticPhrase(primary.pinyin) : ''
  const gloss = primary
    ? parseDefinitions(primary.definitions).definitions.slice(0, 3).join('; ')
    : ''

  const context = current.contexts[current.contexts.length - 1]
  const target =
    current.kind === 'sentence'
      ? chooseTarget(hanWords(segment(current.text, data.words)), data.known, current.target)
      : null
  const cloze = target ? clozeOf(current.text, target) : null

  // Either script is the same word; CC-CEDICT holds both spellings.
  const correct =
    typed.trim() === current.text ||
    (primary && (typed.trim() === primary.simplified || typed.trim() === primary.traditional))

  return (
    <>
      <div class="toolbar">
        <span class="muted small">
          {done} done · {queue.length - at - 1} left
        </span>
        <div class="grow" />
        <button
          onClick={() => {
            setQueue(null)
            reload()
          }}
        >
          End session
        </button>
      </div>

      <div class="panel review-card">
        {current.kind === 'sentence' ? (
          <div class="line-zh review-prompt">
            {cloze && !revealed ? (
              <>
                {cloze.before}
                <span class="blank">{'　'.repeat(Math.max(1, cloze.blank.length))}</span>
                {cloze.after}
              </>
            ) : (
              current.text
            )}
          </div>
        ) : style === 'audio' ? (
          <div class="review-prompt">
            <button class="icon-btn" onClick={() => speak(current.text)} title="Play again">
              ♪ Play again
            </button>
            {revealed && <div class="hanzi-xl">{current.text}</div>}
          </div>
        ) : style === 'type' ? (
          <div class="review-prompt">
            <div class="gloss-prompt">{gloss || '(no definition)'}</div>
            {revealed ? (
              <div class="hanzi-xl">{current.text}</div>
            ) : (
              <input
                type="text"
                autofocus
                value={typed}
                placeholder="Type the characters…"
                onInput={(e) => setTyped(e.currentTarget.value)}
                onKeyDown={(e) => {
                  // Enter reveals; the IME swallows it while a candidate list
                  // is open, so this never fires mid-composition.
                  if (e.key === 'Enter' && !e.isComposing) setRevealed(true)
                }}
              />
            )}
          </div>
        ) : (
          <div class="review-prompt">
            <div class="hanzi-xl">{current.text}</div>
          </div>
        )}

        {revealed && (
          <div class="review-answer">
            {current.kind === 'word' ? (
              <>
                <div class="pinyin">{pinyin}</div>
                <div class="gloss-full">{gloss || 'No definition found'}</div>
                {style === 'type' && (
                  <div class={correct ? 'verdict ok' : 'verdict no'}>
                    {typed.trim()
                      ? correct
                        ? 'Correct'
                        : `You typed ${typed.trim()}`
                      : 'Nothing typed'}
                  </div>
                )}
              </>
            ) : (
              context?.translation && <div class="gloss-full">{context.translation}</div>
            )}

            {canSpeak() && (
              <button class="icon-btn" onClick={() => speak(current.text)}>
                ♪ Listen
              </button>
            )}

            {current.kind === 'word' && context && (
              <div class="review-context">
                <div class="line-zh">{context.text}</div>
                {context.translation && <div class="muted small">{context.translation}</div>}
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

      {revealed ? (
        <div class="grades">
          {GRADES.map((g) => (
            <button key={g.grade} onClick={() => void grade(g.grade)}>
              {g.label}
            </button>
          ))}
        </div>
      ) : (
        <p>
          <button class="primary" onClick={() => setRevealed(true)}>
            Show answer
          </button>
        </p>
      )}
    </>
  )
}
