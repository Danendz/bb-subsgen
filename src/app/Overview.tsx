import { useCallback } from 'preact/hooks'
import { flashcardsDb } from '../flashcards/db'
import { deckCounts, hskProgress, knownSetOf, listItems, listRanks } from '../flashcards/queries'
import { loadSettings, resolveStudyLang } from '../shared/settings'
import { useAsync } from './hooks'
import { useT } from '../i18n/useT'
import { Rich } from '../i18n/Rich'

function pct(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0
}

function Stat({ n, label }: { n: number; label: string }) {
  const { lang } = useT()

  return (
    <div class="panel stat">
      <span class="n">{n.toLocaleString(lang)}</span>
      <span class="label">{label}</span>
    </div>
  )
}

export function Overview() {
  const { t, lang } = useT()
  const load = useCallback(async () => {
    const db = await flashcardsDb()
    const lang = resolveStudyLang(await loadSettings())
    const [items, ranks] = await Promise.all([listItems(db, lang), listRanks(db, lang)])
    return { items, ranks }
  }, [])
  const { data, loading } = useAsync(load)

  if (loading) return <p class="muted">{t('common.loading')}</p>
  if (!data) return <p class="muted">{t('overview.nothingToShow')}</p>

  const { items, ranks } = data
  const counts = deckCounts(items)
  const known = knownSetOf(items)
  const hsk = hskProgress(ranks, known)

  if (!items.length) {
    return (
      <div class="empty">
        <p>{t('overview.emptyTitle')}</p>
        <p class="small">{t('overview.emptyBody')}</p>
      </div>
    )
  }

  // Ranked words are the ones a frequency list actually covers — the honest
  // denominator for "how much of the useful language do I have". CC-CEDICT's
  // 120k headwords are mostly proper nouns and technical terms, so measuring
  // against them would report a fraction of a percent forever.
  const ranked = ranks.filter((r) => r.rank !== undefined)
  const discovered = ranked.filter((r) =>
    items.some((i) => i.kind === 'word' && i.text === r.headword),
  )

  return (
    <>
      <div class="stats">
        <Stat n={counts.words} label={t('overview.stat.words')} />
        <Stat n={counts.known} label={t('overview.stat.known')} />
        <Stat n={counts.sentences} label={t('overview.stat.sentences')} />
        <Stat n={counts.grammar} label={t('overview.stat.grammar')} />
        <Stat n={counts.pool} label={t('overview.stat.pool')} />
      </div>

      {ranked.length > 0 && (
        <div class="panel">
          <div class="row">
            <div class="grow">
              <strong>{t('overview.discovered')}</strong>{' '}
              <span class="muted small">
                {t('overview.discoveredOf', {
                  found: discovered.length,
                  total: ranked.length,
                })}
              </span>
            </div>
            <span class="muted">{pct(discovered.length, ranked.length)}%</span>
          </div>
          <div class="bar">
            <i style={{ width: `${pct(discovered.length, ranked.length)}%` }} />
          </div>
        </div>
      )}

      {hsk.length > 0 && (
        <div class="panel">
          <strong>{t('overview.hsk')}</strong>
          {hsk.map((level) => (
            <div class="hsk-row" key={level.level}>
              <span class="small">{t('overview.hskLevel', { level: level.level })}</span>
              <div class={`bar ${level.known === level.total ? 'good' : ''}`}>
                <i style={{ width: `${pct(level.known, level.total)}%` }} />
              </div>
              <span class="muted small">
                {level.known.toLocaleString(lang)} / {level.total.toLocaleString(lang)}
              </span>
            </div>
          ))}
        </div>
      )}

      {!ranks.length && (
        <div class="panel muted small">
          <Rich
            text={t('overview.noWordList')}
            slots={{ data: <a href="#/data">{t('app.tab.data')}</a> }}
          />
        </div>
      )}
    </>
  )
}
