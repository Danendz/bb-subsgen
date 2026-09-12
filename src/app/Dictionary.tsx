import { useCallback, useEffect, useMemo, useState } from 'preact/hooks'
import { flashcardsDb } from '../flashcards/db'
import { listExposures, listItems } from '../flashcards/queries'
import { isKnown } from '../flashcards/known'
import { discoverWord, markKnown } from '../background/flashcards-store'
import { loadDictionary } from '../lang/search'
import { lookupDefs } from '../shared/dict-client'
import { resolveStudyLang } from '../shared/settings'
import { packFor } from '../lang/packs'
import { DICT_SOURCES } from '../dict/sources'
import { Pinyin } from './pinyin'
import { masteryOf, masteryTitle, Pips } from './mastery'
import type { Entry, LanguagePack, ReadingPart } from '../lang/pack'
import type { Item } from '../flashcards/types'
import { deckChanged, useDeckChanged } from './deck-signal'
import { useAsync } from './hooks'
import { useSettings } from '../settings/useSettings'
import { canSpeak, speak } from '../shared/speak'
import { useT } from '../i18n/useT'
import type { MessageKey } from '../i18n/keys'

/** Rendered at a time. The deck can run to thousands; the DOM does not need to. */
const PAGE = 120

type Filter = 'all' | 'learning' | 'known' | 'sentences'

const FILTERS: Array<{ key: Filter; label: MessageKey }> = [
  { key: 'all', label: 'dict.filter.all' },
  { key: 'learning', label: 'dict.filter.learning' },
  { key: 'known', label: 'dict.filter.known' },
  { key: 'sentences', label: 'dict.filter.sentences' },
]

function matches(item: Item, filter: Filter): boolean {
  if (filter === 'sentences') return item.kind === 'sentence'
  if (item.kind !== 'word') return false
  if (filter === 'known') return isKnown(item)
  if (filter === 'learning') return !isKnown(item)
  return true
}

/** Dictionary matches offered per search. Enough to choose from, not to scroll. */
const SUGGESTIONS = 20

/** Senses per row. The list is for recognising a word, not for studying it. */
const SENSES = 2

function glossOf(pack: LanguagePack, entries: Entry[] | undefined, headword: string): string {
  const [primary] = pack.rank(entries ?? [], headword)
  return (
    primary?.senses
      .slice(0, SENSES)
      .map((sense) => sense.gloss)
      .join('; ') ?? ''
  )
}

/** The best entry's reading — `[]` when there is none. */
function readingOf(
  pack: LanguagePack,
  entries: Entry[] | undefined,
  headword: string,
): ReadingPart[] {
  const [primary] = pack.rank(entries ?? [], headword)
  return primary?.reading ?? []
}

export function Dictionary() {
  const { t } = useT()
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [limit, setLimit] = useState(PAGE)

  // Through the hook, so the language filter in the app header moves this page
  // with it. It has to re-read rather than re-filter: every row is ranked and
  // parsed by one language's pack, so a merged list would render a Japanese card
  // through the Chinese one.
  const { settings, loaded } = useSettings()
  const lang = loaded ? resolveStudyLang(settings) : ''

  const load = useCallback(async () => {
    // Nothing to read the deck against until the settings land — the same rule
    // the Review tab follows, and for the same reason: reading it on the
    // defaults would list one language and then immediately list another.
    if (!lang) return null
    const db = await flashcardsDb()
    const [items, exposures] = await Promise.all([listItems(db, lang), listExposures(db)])
    return {
      items,
      seen: new Map(exposures.map((e) => [e.headword, e.count])),
    }
  }, [lang])
  const { data, loading, reload } = useAsync(load)
  useDeckChanged(reload)

  // The list underneath is a different list now, and page 4 of it means
  // nothing — the same reset the filter buttons do.
  useEffect(() => setLimit(PAGE), [lang])

  const shown = useMemo(() => {
    if (!data) return []
    const q = query.trim()
    return (
      data.items
        .filter((item) => matches(item, filter))
        .filter((item) => !q || item.text.includes(q))
        // Most-seen first: the words in front of you most often are the ones
        // worth acting on, and it puts the deck's own priorities at the top.
        .sort(
          (a, b) =>
            (data.seen.get(b.text) ?? 0) - (data.seen.get(a.text) ?? 0) ||
            b.createdAt - a.createdAt,
        )
    )
  }, [data, filter, query])

  const page = shown.slice(0, limit)

  // One batched round trip for exactly what is on screen, rather than a lookup
  // per row or the whole deck up front.
  const collected = useMemo(() => new Set(data?.items.map((item) => item.text) ?? []), [data])
  const q = query.trim()

  /**
   * Words in the dictionary the deck has never held.
   *
   * Loads the 4.5MB word list only when there is a language to load it for.
   * A query with nothing lookup-able in it is answered by the lexicon itself
   * without walking the index — see `Lexicon.search`.
   */
  const findSuggestions = useCallback(async () => {
    if (!q || !lang) return []
    const lexicon = await loadDictionary(lang)
    return lexicon?.search(q, collected, SUGGESTIONS) ?? []
  }, [q, collected, lang])
  const { data: suggestions } = useAsync(findSuggestions)

  const headwords = useMemo(
    () => [
      ...page.filter((item) => item.kind === 'word').map((item) => item.text),
      ...(suggestions ?? []),
    ],
    [page, suggestions],
  )
  const useTraditional = settings.useTraditional
  const loadDefs = useCallback(
    (): Promise<Record<string, Entry[]>> =>
      lang ? lookupDefs(lang, headwords, useTraditional) : Promise.resolve({}),
    [headwords.join('\u0000'), lang, useTraditional],
  )
  const { data: defs } = useAsync(loadDefs)

  // `!loaded` as well as `loading`: with no language resolved yet there is no
  // pack either, and the check below would flash "no language pack" at every
  // open before the settings land.
  if (loading || !loaded) return <p class="muted">{t('common.loading')}</p>
  // Every row below ranks and parses an entry, and only the language knows how.
  // Unreachable while `packs.test.ts` holds the two registries to one set of
  // languages, so this names the language rather than rendering half a screen.
  const pack = packFor(lang)
  if (!pack) {
    return <p class="muted">{t('dict.noPack', { lang: lang || t('dict.thisLanguage') })}</p>
  }

  const toggleKnown = async (item: Item) => {
    await markKnown(item.lang, item.text, !isKnown(item))
    deckChanged()
  }

  const add = async (headword: string) => {
    await discoverWord(lang, headword)
    deckChanged()
  }

  return (
    <>
      <div class="toolbar">
        <div class="grow">
          <input
            type="search"
            placeholder={t('dict.search')}
            value={query}
            onInput={(e) => {
              setQuery(e.currentTarget.value)
              setLimit(PAGE)
            }}
          />
        </div>
        {FILTERS.map((f) => (
          <button
            key={f.key}
            class={filter === f.key ? 'primary' : ''}
            onClick={() => {
              setFilter(f.key)
              setLimit(PAGE)
            }}
          >
            {t(f.label)}
          </button>
        ))}
      </div>

      {!shown.length ? (
        <div class="empty">
          <p>{suggestions?.length ? t('dict.notCollected') : t('dict.nothingHere')}</p>
          <p class="small">
            {!query
              ? t('dict.lookSomethingUp')
              : suggestions?.length
                ? t('dict.dictionaryHasThese')
                : t('dict.noMatch')}
          </p>
        </div>
      ) : (
        <div class="panel">
          {page.map((item) =>
            item.kind === 'sentence' ? (
              <div class="row" key={item.id}>
                <div class="grow">
                  <div class="line-zh">{item.text}</div>
                  <div class="muted small">{item.contexts[0]?.translation}</div>
                </div>
                {item.state === 'pool' && <span class="tag pool">{t('dict.pool')}</span>}
                {canSpeak(pack.voiceLang) && (
                  <button
                    class="icon-btn"
                    title={t('dict.speak')}
                    onClick={() => speak(item.text, pack.voiceLang)}
                  >
                    ♪
                  </button>
                )}
              </div>
            ) : (
              <div class="row" key={item.id}>
                <span class="hanzi">{item.text}</span>
                <Pinyin parts={readingOf(pack, defs?.[item.text], item.text)} />
                <span class="grow gloss">{glossOf(pack, defs?.[item.text], item.text)}</span>
                {(data?.seen.get(item.text) ?? 0) > 0 && (
                  <span class="muted small" title={t('dict.timesSeen')}>
                    {t('dict.times', { count: data!.seen.get(item.text)! })}
                  </span>
                )}
                <span title={masteryTitle(item, t)}>
                  <Pips level={masteryOf(item)} compact />
                </span>
                {canSpeak(pack.voiceLang) && (
                  <button
                    class="icon-btn"
                    title={t('dict.speak')}
                    onClick={() => speak(item.text, pack.voiceLang)}
                  >
                    ♪
                  </button>
                )}
                <button
                  class={isKnown(item) ? 'on' : ''}
                  onClick={() => void toggleKnown(item)}
                  title={isKnown(item) ? t('dict.unmarkKnown') : t('dict.markKnown')}
                >
                  {isKnown(item) ? t('dict.isKnown') : t('dict.iKnowThis')}
                </button>
              </div>
            ),
          )}
        </div>
      )}

      {suggestions && suggestions.length > 0 && (
        <>
          <p class="muted small">{t('dict.notInDeck')}</p>
          <div class="panel">
            {suggestions.map((headword) => (
              <div class="row" key={headword}>
                <span class="hanzi">{headword}</span>
                <Pinyin parts={readingOf(pack, defs?.[headword], headword)} />
                <span class="grow gloss">{glossOf(pack, defs?.[headword], headword)}</span>
                {canSpeak(pack.voiceLang) && (
                  <button
                    class="icon-btn"
                    title={t('dict.speak')}
                    onClick={() => speak(headword, pack.voiceLang)}
                  >
                    ♪
                  </button>
                )}
                <button
                  class="primary"
                  onClick={() => void add(headword)}
                  title={t('dict.addToDeck')}
                >
                  {t('dict.add')}
                </button>
              </div>
            ))}
          </div>
          <p class="muted small">{t('dict.addedNote')}</p>
        </>
      )}

      {shown.length > page.length && (
        <p>
          <button onClick={() => setLimit((n) => n + PAGE)}>
            {t('dict.showMore', { count: shown.length - page.length })}
          </button>
        </p>
      )}

      {/* Credited here rather than in the popup, which shows no definitions at
          all and carried both licences on every open. CC BY-SA 4.0 asks for the
          notice where the material is shown, and this page is where the app
          shows it in bulk. Read from `DICT_SOURCES` so the language on screen is
          the dictionary credited. */}
      {DICT_SOURCES[lang] && <p class="attribution">{DICT_SOURCES[lang].attribution}</p>}
    </>
  )
}
