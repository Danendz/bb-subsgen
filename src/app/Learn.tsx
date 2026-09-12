// The home screen: the path you unlock by watching.
//
// `/` used to be a stats dashboard and then, for one slice, a placeholder. What
// it is now is the frequency list cut into circles, with a circle opening when
// every one of its eight words is in your deck — so watching a video is what
// builds the road, and the deck stops being one flat queue with no sense of
// where you are in it.
//
// The orchestrator only. Which circle is worth what is `src/flashcards/path.ts`
// and how they are drawn is `src/app/path/`; what this holds is the read, the
// intake session, and the two states where there is no path to draw at all.
//
// Learn adds, Review maintains. Pressing a circle runs `buildIntake` — its
// eight words and nothing else — rather than `buildSession`, and the scheduler,
// the ladder and the daily budget are untouched by everything here.

import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { discoverWord, rankKey, rankMap } from '../background/flashcards-store'
import { flashcardsDb } from '../flashcards/db'
import { knownSetOf, listItems, listRanks } from '../flashcards/queries'
import { bandsFor, circleState, waiting, type Circle } from '../flashcards/path'
import { buildIntake, type QueueSession } from '../flashcards/queue'
import { sourcesFor } from '../flashcards/wordlist-sources'
import { packFor } from '../lang/packs'
import { resolveStudyLang } from '../shared/settings'
import { useSettings } from '../settings/useSettings'
import { deckChanged, useDeckChanged } from './deck-signal'
import { navigate, useAsync } from './hooks'
import { Path } from './path/Path'
import { dominantTone } from './pinyin'
import { loadLexicon, resolveChoices } from './review/deck'
import { Session } from './review/Session'
import { useT } from '../i18n/useT'
import type { Choice } from '../flashcards/choices'
import type { Item } from '../flashcards/types'

export function Learn() {
  const { t } = useT()
  const { settings, loaded } = useSettings()
  const lang = loaded ? resolveStudyLang(settings) : ''

  const load = useCallback(async () => {
    // Nothing to read the deck against until the settings land — see Review.
    if (!lang) return null
    const db = await flashcardsDb()
    const [items, ranks, words, allRanks] = await Promise.all([
      listItems(db, lang),
      listRanks(db, lang),
      loadLexicon(lang),
      rankMap(),
    ])
    return { items, ranks, words, lang, known: knownSetOf(items), rankMap: allRanks }
  }, [lang])
  const { data, loading, reload } = useAsync(load)
  useDeckChanged(reload)

  const [session, setSession] = useState<QueueSession | null>(null)
  const [choices, setChoices] = useState<ReadonlyMap<string, Choice[]>>(new Map())
  const [busy, setBusy] = useState(false)

  const sections = useMemo(
    () => (data ? bandsFor(data.ranks, packFor(data.lang)?.sections) : []),
    [data],
  )

  // Built once for the whole path: `circleState` runs per circle, and a deck
  // scan inside each of a thousand of them is the difference between a screen
  // that renders and one that stalls.
  const deck = useMemo(
    () =>
      new Map(
        (data?.items ?? []).flatMap((item): Array<[string, Item]> =>
          item.kind === 'word' ? [[item.text, item]] : [],
        ),
      ),
    [data],
  )

  /**
   * Where the screen opens, and what the aside's action points at.
   *
   * The circle you can run beats the one you are nearest to opening, which
   * beats the first thing you have not finished. Anything else lands you on a
   * circle you can do nothing with.
   */
  const focus = useMemo(() => {
    let ready = -1
    let unfinished = -1
    for (const section of sections) {
      for (const unit of section.units) {
        for (const circle of unit.circles) {
          const status = circleState(circle, deck).status
          if (status === 'ready' && ready < 0) ready = circle.index
          if (status !== 'mastered' && unfinished < 0) unfinished = circle.index
        }
      }
    }
    if (ready >= 0) return ready
    return waiting(sections, deck).next?.circle.index ?? Math.max(0, unfinished)
  }, [sections, deck])

  /**
   * Circles that became mastered since the last read of the deck.
   *
   * The screen's one animated moment, and the reason it is derived here rather
   * than in CSS: the path is what you land on after reviewing, so animating
   * every mastered circle on mount would animate the whole screen on every
   * visit. Comparing the set across a reload names only the ones that actually
   * changed, and the first read animates nothing because there is no before.
   */
  const mastered = useMemo(() => {
    const set = new Set<number>()
    for (const section of sections) {
      for (const unit of section.units) {
        for (const circle of unit.circles) {
          if (circleState(circle, deck).status === 'mastered') set.add(circle.index)
        }
      }
    }
    return set
  }, [sections, deck])

  const before = useRef<ReadonlySet<number> | null>(null)
  const [won, setWon] = useState<ReadonlySet<number>>(new Set())
  useEffect(() => {
    const previous = before.current
    before.current = mastered
    if (!previous) return
    const fresh = [...mastered].filter((index) => !previous.has(index))
    if (fresh.length > 0) setWon(new Set(fresh))
  }, [mastered])

  const rankOfWord = useCallback(
    (headword: string) => data?.rankMap.get(rankKey(data.lang, headword)),
    [data],
  )

  const toneOf = useCallback(
    (word: string) =>
      data?.words && data.words.pack.displaysTones ? dominantTone(word, data.words) : null,
    [data],
  )

  const start = useCallback(
    async (circle: Circle) => {
      if (!data?.words || busy) return
      const built = buildIntake({ words: circle.words, items: data.items })
      setBusy(true)
      try {
        setChoices(
          await resolveChoices(
            built.cards,
            { deck: data.items, words: data.words, lang: data.lang, rankOf: rankOfWord },
            settings,
          ),
        )
        setSession(built)
      } finally {
        setBusy(false)
      }
    },
    [data, busy, rankOfWord, settings],
  )

  /**
   * The escape hatch, and the reason a locked circle is worth pressing.
   *
   * Called on the app page, so it writes through the store directly rather than
   * sending `bb-subsgen:discover-word` — the same thing the Dictionary tab does
   * from two screens away, and it is what lets the announcement below reach a
   * store that has already been written.
   */
  const add = useCallback(
    async (words: string[]) => {
      if (!data || busy) return
      setBusy(true)
      try {
        for (const word of words) await discoverWord(data.lang, word)
        deckChanged()
      } finally {
        setBusy(false)
      }
    },
    [data, busy],
  )

  if (loading || !data) return <p class="muted">{t('common.loading')}</p>
  if (!data.words) return <p class="muted">{t('review.noPack', { lang: data.lang })}</p>

  if (session && session.cards.length > 0) {
    return (
      <Session
        key={session.cards[0]?.id}
        queue={session.cards}
        extra={session.extra}
        words={data.words}
        known={data.known}
        distractorPool={[...data.known]}
        deckWords={data.items.flatMap((item) => (item.kind === 'word' ? [item.text] : []))}
        rankOf={rankOfWord}
        choices={choices}
        mode={settings.studyMode}
        onFinish={() => {
          setSession(null)
          deckChanged()
        }}
      />
    )
  }

  // Two different nothings, and telling them apart is the whole point. A
  // language with a list and no ranks is one install away from a path; one with
  // no list has nothing to install, and a button that downloads nothing is
  // worse than a sentence saying so.
  if (sections.length === 0) {
    const installable = sourcesFor(data.lang, 'frequency').length > 0
    return (
      <div class="empty">
        <p>{installable ? t('learn.needList.title') : t('learn.noList.title')}</p>
        <p class="small">{installable ? t('learn.needList.body') : t('learn.noList.body')}</p>
        <button
          class={installable ? 'primary' : ''}
          onClick={() => navigate(installable ? '/setup' : '/review')}
        >
          {installable ? t('learn.needList.action') : t('learn.review')}
        </button>
      </div>
    )
  }

  return (
    <>
      <h1>{t('learn.title')}</h1>
      <p class="muted small">{t('learn.blurb')}</p>
      <Path
        sections={sections}
        deck={deck}
        focus={focus}
        won={won}
        toneOf={toneOf}
        busy={busy}
        onStart={(circle) => void start(circle)}
        onAdd={(words) => void add(words)}
      />
    </>
  )
}
