// The review tab: what is waiting, how you want to be asked, and the session.
//
// This is the orchestrator. It loads the deck, holds the saved setup, and hands
// a built queue to `Session`; everything about how a card is asked lives in
// flashcards/exercise.ts, and everything about how a session runs lives in
// review/Session.tsx.

import { useCallback, useMemo, useState } from 'preact/hooks'
import { flashcardsDb } from '../flashcards/db'
import { knownSetOf, listExposures, listItems, studyStreak } from '../flashcards/queries'
import { buildSession, queueCounts, type QueueSession } from '../flashcards/queue'
import { vocabularyIn, unknownIn } from '../flashcards/capture'
import { rankKey, rankMap } from '../background/flashcards-store'
import type { Choice } from '../flashcards/choices'
import { loadLexicon, resolveChoices } from './review/deck'
import { resolveStudyLang } from '../shared/settings'
import type { Item } from '../flashcards/types'
import { useAsync } from './hooks'
import { useSettings } from '../settings/useSettings'
import { canSpeak } from '../shared/speak'
import { Session } from './review/Session'
import { Setup, setupSummary, type SessionSetup } from './review/Setup'
import { useT } from '../i18n/useT'

export function Review() {
  const { t, lang: uiLang } = useT()

  // Through the hook rather than `loadSettings`/`saveSettings`: the panel used
  // to lay a local `override` over a loaded snapshot to answer immediately, and
  // that is `useSettings`' pending ref written a second time.
  const { settings, loaded, update } = useSettings()

  // The one setting the load depends on. Everything else in the setup only
  // shapes a queue built from data already in hand, but this decides which
  // lexicon `loadWords` reads, so changing it has to re-run the read.
  const lang = loaded ? resolveStudyLang(settings) : ''

  const load = useCallback(async () => {
    // Nothing to read the deck against until the settings land: reading it on
    // the defaults would load one lexicon and then immediately load another.
    if (!lang) return null
    const db = await flashcardsDb()
    const [items, words, ranks, streak, exposures] = await Promise.all([
      listItems(db, lang),
      loadLexicon(lang),
      rankMap(),
      studyStreak(db),
      listExposures(db),
    ])
    return {
      items,
      words,
      lang,
      ranks,
      streak,
      known: knownSetOf(items),
      // What orders the word pool. Passively collected words have no other
      // claim on your attention than how often you have actually met them.
      seen: new Map(exposures.map((e) => [rankKey(e.lang, e.headword), e.count])),
    }
  }, [lang])
  const { data, loading, reload } = useAsync(load)

  const [session, setSession] = useState<QueueSession | null>(null)
  // Resolved with the session rather than inside it, so no card pauses to fetch
  // its own options and no option set renders half-translated. See
  // `review/options.ts`.
  const [choices, setChoices] = useState<ReadonlyMap<string, Choice[]>>(new Map())
  const [building, setBuilding] = useState(false)
  const [editing, setEditing] = useState(false)

  const unknownCount = useCallback(
    (item: Item) =>
      data?.words ? unknownIn(vocabularyIn(data.words.segment(item.text)), data.known).length : 0,
    [data],
  )

  // Both maps are keyed by headword *within* a language, and the card is what
  // knows which — see `rankMapIn`. The pairing stays here, where the maps are,
  // so `queue.ts` remains a pure ordering module.
  const rankOf = useCallback((item: Item) => data?.ranks.get(rankKey(item.lang, item.text)), [data])

  const seenCount = useCallback(
    (item: Item) => data?.seen.get(rankKey(item.lang, item.text)) ?? 0,
    [data],
  )

  // The saved setup. No local copy laid over the top: `update` applies the
  // change to the hook's state before the write goes out, so the panel already
  // answers immediately.
  const setup: SessionSetup | null = useMemo(
    () =>
      data
        ? {
            studyMode: settings.studyMode,
            studyInclude: settings.studyInclude,
            studySessionSize: settings.studySessionSize,
          }
        : null,
    [data, settings.studyMode, settings.studyInclude, settings.studySessionSize],
  )

  const counts = useMemo(
    () =>
      data && setup
        ? queueCounts({
            items: data.items,
            now: Date.now(),
            newSentencesPerDay: settings.newSentencesPerDay,
            include: setup.studyInclude,
            unknownCount,
            rankOf,
            seenCount,
          })
        : null,
    [data, setup, settings.newSentencesPerDay, unknownCount, rankOf, seenCount],
  )

  const distractorPool = useMemo(() => (data ? [...data.known] : []), [data])

  // The whole deck's words, not the session's: how near two words sit in
  // frequency is a better question the more words there are to ask it of.
  const deckWords = useMemo(
    () => (data ? data.items.flatMap((item) => (item.kind === 'word' ? [item.text] : [])) : []),
    [data],
  )

  const rankOfWord = useCallback(
    (headword: string) => data?.ranks.get(rankKey(data.lang, headword)),
    [data],
  )

  if (loading || !data || !counts || !setup) return <p class="muted">{t('common.loading')}</p>
  // Only reachable if the study language outlived its pack — `packs.test.ts`
  // holds the registries together, so this says which language rather than
  // pretending the screen is still loading.
  if (!data.words) return <p class="muted">{t('review.noPack', { lang: data.lang })}</p>

  const words = data.words
  const start = async () => {
    if (building) return
    const built = buildSession({
      items: data.items,
      now: Date.now(),
      newSentencesPerDay: settings.newSentencesPerDay,
      include: setup.studyInclude,
      limit: setup.studySessionSize,
      unknownCount,
      rankOf,
      seenCount,
    })

    setBuilding(true)
    try {
      setChoices(
        await resolveChoices(
          built.cards,
          { deck: data.items, words, lang: data.lang, rankOf: rankOfWord },
          settings,
        ),
      )
      setSession(built)
    } finally {
      setBuilding(false)
    }
  }

  if (session && session.cards.length > 0) {
    return (
      <Session
        key={session.cards[0]?.id}
        queue={session.cards}
        extra={session.extra}
        words={data.words}
        known={data.known}
        distractorPool={distractorPool}
        deckWords={deckWords}
        rankOf={rankOfWord}
        choices={choices}
        mode={setup.studyMode}
        onFinish={() => {
          setSession(null)
          reload()
        }}
      />
    )
  }

  // What is owed, and then what the rest of the session is made of. Split apart
  // because they are different promises: the scheduled cards are the day's work,
  // the practice is only there so the session is never empty.
  // Listed in the order `buildSession` concatenates them, because `teaching`
  // below depends on it: words are drawn after every other scheduled source, so
  // the new words that fit are whatever those left room for. Patterns are in the
  // sum — they were missing from it, which made the shortfall line appear on a
  // session that was in fact full of grammar.
  const owed = counts.due + counts.newSentences + counts.newGrammar + counts.newWords
  const scheduled = Math.min(owed, setup.studySessionSize)
  const drilled = Math.min(counts.practice, setup.studySessionSize - scheduled)
  const studying = scheduled + drilled

  // A word nobody has met yet is taught before it is asked, and the teach screen
  // is not one of the cards — the session still holds exactly `studying` of
  // those. It is said out loud because it is the whole reason the sitting takes
  // longer than the number in front of it promises.
  const teaching = Math.max(0, scheduled - (counts.due + counts.newSentences + counts.newGrammar))

  // Why the session is smaller than the size that was asked for. Without this
  // the screen says only how many cards there are, which reads as a bug when the
  // deck visibly holds more — and the commonest cause is the one nothing on the
  // screen mentions, that the session was narrowed to a single kind of card.
  const shortfall =
    studying < setup.studySessionSize
      ? setup.studyInclude === 'words'
        ? t('review.shortfall.words')
        : setup.studyInclude === 'sentences'
          ? t('review.shortfall.sentences')
          : t('review.shortfall.all')
      : ''

  // Joined here rather than concatenated in the markup: each clause is its own
  // message, and a language that orders them differently keeps the separator.
  const detail = [
    t('review.cards', { count: studying }),
    ...(drilled > 0 ? [t('review.breakdown', { scheduled, drilled })] : []),
    ...(teaching > 0 ? [t('review.teaching', { count: teaching })] : []),
    ...(owed > scheduled ? [t('review.waiting', { count: owed })] : []),
    ...(shortfall ? [shortfall] : []),
  ].join(' \u00b7 ')

  return (
    <>
      {data.streak > 0 && (
        <p class="streak">
          <span aria-hidden="true">🔥</span> {t('review.streak', { count: data.streak })}
        </p>
      )}

      <div class="stats">
        <div class="panel stat">
          <span class="n">{counts.due.toLocaleString(uiLang)}</span>
          <span class="label">{t('review.stat.due')}</span>
        </div>
        <div class="panel stat">
          <span class="n">{counts.newWords.toLocaleString(uiLang)}</span>
          <span class="label">{t('review.stat.newWords')}</span>
        </div>
        <div class="panel stat">
          <span class="n">{counts.newSentences.toLocaleString(uiLang)}</span>
          <span class="label">{t('review.stat.newLines')}</span>
        </div>
        <div class="panel stat">
          <span class="n">{counts.pooled.toLocaleString(uiLang)}</span>
          <span class="label">{t('review.stat.pooled')}</span>
        </div>
      </div>

      <div class="panel setup-panel">
        <div class="setup-summary">
          <span class="summary-text">{setupSummary(setup, t)}</span>
          <button class="ghost" aria-expanded={editing} onClick={() => setEditing((on) => !on)}>
            {editing ? t('review.done') : t('review.change')}
          </button>
        </div>

        {editing && (
          <Setup setup={setup} canSpeak={canSpeak(data.words.pack.voiceLang)} onChange={update} />
        )}
      </div>

      {studying > 0 ? (
        <div class="start">
          <button class="primary big" disabled={building} onClick={() => void start()}>
            {building ? t('common.loading') : t('review.start')}
          </button>
          <p class="small muted">{detail}</p>
        </div>
      ) : (
        <div class="empty">
          <p>{t('review.emptyTitle')}</p>
          <p class="small">
            {counts.pooled > 0
              ? t('review.emptyPooled', { count: counts.pooled })
              : t('review.emptyBody')}
          </p>
        </div>
      )}
    </>
  )
}
