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
import { rankMap } from '../background/flashcards-store'
import { packFor } from '../lang/packs'
import { dictDb, getAllMeta, getLexiconIn } from '../dict/store'
import { installedSources } from '../dict/sources'
import { resolveStudyLang } from '../shared/settings'
import type { Item } from '../flashcards/types'
import { useAsync } from './hooks'
import { useSettings } from '../settings/useSettings'
import { canSpeak } from '../shared/speak'
import { Session } from './review/Session'
import { Setup, setupSummary, type SessionSetup } from './review/Setup'

/**
 * Extension-origin caller, so it reads the store directly rather than asking
 * the worker for it — see src/dict/store.ts. No dictionary installed loads the
 * empty lexicon: a deck with nothing to segment against is not a reason to fail
 * the whole screen. A language with no pack has nothing to load it with, and is
 * the one case that has to be null.
 */
async function loadWords(lang: string) {
  const pack = packFor(lang)
  if (!pack) return null
  const text = await getLexiconIn(await dictDb(), lang)
  return pack.load(text ?? '')
}

export function Review() {
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
    const dict = await dictDb()
    const db = await flashcardsDb()
    const [items, words, installed, ranks, streak, exposures] = await Promise.all([
      listItems(db),
      loadWords(lang),
      getAllMeta(dict),
      rankMap(),
      studyStreak(db),
      listExposures(db),
    ])
    return {
      items,
      words,
      lang,
      installedLangs: new Set(Object.keys(installed)),
      ranks,
      streak,
      known: knownSetOf(items),
      // What orders the word pool. Passively collected words have no other
      // claim on your attention than how often you have actually met them.
      seen: new Map(exposures.map((e) => [e.headword, e.count])),
    }
  }, [lang])
  const { data, loading, reload } = useAsync(load)

  const [session, setSession] = useState<QueueSession | null>(null)
  const [editing, setEditing] = useState(false)

  const unknownCount = useCallback(
    (item: Item) =>
      data?.words ? unknownIn(vocabularyIn(data.words.segment(item.text)), data.known).length : 0,
    [data],
  )

  const rankOf = useCallback((headword: string) => data?.ranks.get(headword), [data])

  const seenCount = useCallback((headword: string) => data?.seen.get(headword) ?? 0, [data])

  /**
   * Which languages the picker can offer: enabled, and actually installed.
   *
   * Out of `load` rather than in it, because it is the only thing there that
   * reads a setting the load does not otherwise depend on — putting
   * `enabledLanguages` in the dependency list would re-read the whole deck on
   * every storage echo.
   */
  const languages = useMemo(
    () => (data ? installedSources(settings.enabledLanguages, data.installedLangs) : []),
    [data, settings.enabledLanguages],
  )

  // The saved setup. No local copy laid over the top: `update` applies the
  // change to the hook's state before the write goes out, so the panel already
  // answers immediately.
  const setup: SessionSetup | null = useMemo(
    () =>
      data
        ? {
            // The resolved language, not the raw setting: with one dictionary
            // installed nothing has ever written `studyLang`, and the control
            // has to show that language as the one in use.
            studyLang: data.lang,
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

  if (loading || !data || !counts || !setup) return <p class="muted">Loading…</p>
  // Only reachable if the study language outlived its pack — `packs.test.ts`
  // holds the registries together, so this says which language rather than
  // pretending the screen is still loading.
  if (!data.words) return <p class="muted">No language pack for {data.lang}.</p>

  const start = () => {
    setSession(
      buildSession({
        items: data.items,
        now: Date.now(),
        newSentencesPerDay: settings.newSentencesPerDay,
        include: setup.studyInclude,
        limit: setup.studySessionSize,
        unknownCount,
        rankOf,
        seenCount,
      }),
    )
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
  const owed = counts.due + counts.newWords + counts.newSentences
  const scheduled = Math.min(owed, setup.studySessionSize)
  const drilled = Math.min(counts.practice, setup.studySessionSize - scheduled)
  const studying = scheduled + drilled

  // Why the session is smaller than the size that was asked for. Without this
  // the screen says only how many cards there are, which reads as a bug when the
  // deck visibly holds more — and the commonest cause is the one nothing on the
  // screen mentions, that the session was narrowed to a single kind of card.
  const shortfall =
    studying < setup.studySessionSize
      ? setup.studyInclude === 'words'
        ? 'that is every word ready — switch to lines too for more'
        : setup.studyInclude === 'sentences'
          ? 'that is every line ready — switch to words too for more'
          : 'that is everything ready'
      : ''

  return (
    <>
      {data.streak > 0 && (
        <p class="streak">
          <span aria-hidden="true">🔥</span> {data.streak} day{data.streak === 1 ? '' : 's'} in a
          row
        </p>
      )}

      <div class="stats">
        <div class="panel stat">
          <span class="n">{counts.due}</span>
          <span class="label">due for review</span>
        </div>
        <div class="panel stat">
          <span class="n">{counts.newWords}</span>
          <span class="label">words not started</span>
        </div>
        <div class="panel stat">
          <span class="n">{counts.newSentences}</span>
          <span class="label">new lines today</span>
        </div>
        <div class="panel stat">
          <span class="n">{counts.pooled}</span>
          <span class="label">lines waiting</span>
        </div>
      </div>

      <div class="panel setup-panel">
        <div class="setup-summary">
          <span class="summary-text">{setupSummary(setup)}</span>
          <button class="ghost" aria-expanded={editing} onClick={() => setEditing((on) => !on)}>
            {editing ? 'Done' : 'Change'}
          </button>
        </div>

        {editing && (
          <Setup setup={setup} canSpeak={canSpeak()} languages={languages} onChange={update} />
        )}
      </div>

      {studying > 0 ? (
        <div class="start">
          <button class="primary big" onClick={start}>
            Start studying
          </button>
          <p class="small muted">
            {studying} card{studying === 1 ? '' : 's'}
            {drilled > 0 ? ` · ${scheduled} scheduled, ${drilled} practice` : ''}
            {owed > scheduled ? ` · ${owed} waiting` : ''}
            {shortfall ? ` · ${shortfall}` : ''}
          </p>
        </div>
      ) : (
        <div class="empty">
          <p>Nothing to study yet.</p>
          <p class="small">
            {counts.pooled > 0
              ? `${counts.pooled} lines are waiting their turn — they are let in a few a day, easiest first.`
              : 'Go and read something; whatever you look up will show up here.'}
          </p>
        </div>
      )}
    </>
  )
}
