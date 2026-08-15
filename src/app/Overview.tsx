import { useCallback } from 'preact/hooks'
import { flashcardsDb } from '../flashcards/db'
import { deckCounts, hskProgress, knownSetOf, listItems, listRanks } from '../flashcards/queries'
import { useAsync } from './hooks'

function pct(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <div class="panel stat">
      <span class="n">{n.toLocaleString()}</span>
      <span class="label">{label}</span>
    </div>
  )
}

export function Overview() {
  const load = useCallback(async () => {
    const db = await flashcardsDb()
    const [items, ranks] = await Promise.all([listItems(db), listRanks(db)])
    return { items, ranks }
  }, [])
  const { data, loading } = useAsync(load)

  if (loading) return <p class="muted">Loading…</p>
  if (!data) return <p class="muted">Nothing to show yet.</p>

  const { items, ranks } = data
  const counts = deckCounts(items)
  const known = knownSetOf(items)
  const hsk = hskProgress(ranks, known)

  if (!items.length) {
    return (
      <div class="empty">
        <p>Nothing collected yet.</p>
        <p class="small">
          Watch a subtitled Bilibili video, or hold the reader key on a page you have enabled,
          and the words you look up will land here.
        </p>
      </div>
    )
  }

  // Ranked words are the ones a frequency list actually covers — the honest
  // denominator for "how much of the useful language do I have". CC-CEDICT's
  // 120k headwords are mostly proper nouns and technical terms, so measuring
  // against them would report a fraction of a percent forever.
  const ranked = ranks.filter((r) => r.rank !== undefined)
  const discovered = ranked.filter((r) => items.some((i) => i.kind === 'word' && i.text === r.headword))

  return (
    <>
      <div class="stats">
        <Stat n={counts.words} label="words collected" />
        <Stat n={counts.known} label="words known" />
        <Stat n={counts.sentences} label="sentences" />
        <Stat n={counts.grammar} label="patterns" />
        <Stat n={counts.pool} label="waiting" />
      </div>

      {ranked.length > 0 && (
        <div class="panel">
          <div class="row">
            <div class="grow">
              <strong>Discovered</strong>{' '}
              <span class="muted small">
                {discovered.length.toLocaleString()} of the {ranked.length.toLocaleString()} most
                common words
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
          <strong>HSK</strong>
          {hsk.map((level) => (
            <div class="hsk-row" key={level.level}>
              <span class="small">HSK {level.level}</span>
              <div class={`bar ${level.known === level.total ? 'good' : ''}`}>
                <i style={{ width: `${pct(level.known, level.total)}%` }} />
              </div>
              <span class="muted small">
                {level.known} / {level.total}
              </span>
            </div>
          ))}
        </div>
      )}

      {!ranks.length && (
        <div class="panel muted small">
          No word list loaded, so new cards are introduced in the order you found them and there
          is no denominator to measure progress against. Load one from{' '}
          <a href="#/data">Data</a> — it explains where to get one.
        </div>
      )}
    </>
  )
}
