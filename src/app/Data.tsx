import { useEffect, useState } from 'preact/hooks'
import {
  conflictsOf,
  emptyBackup,
  isBackup,
  merge,
  upgrade,
  type Backup,
  type Conflict,
} from '../flashcards/backup'
import {
  deleteWordList,
  exportBackup,
  replaceWordList,
  restore,
  wordListMeta,
  type WordListMeta,
} from '../background/flashcards-store'
import { errorMessage, parseWordList, type ListKind, type ParsedList } from '../flashcards/wordlist'
import { installWordList, type WordListProgress } from '../flashcards/wordlist-install'
import { sourcesFor, type WordListSource } from '../flashcards/wordlist-sources'
import type { LanguagePack } from '../lang/pack'
import { packFor } from '../lang/packs'
import { loadSettings, resolveStudyLang } from '../shared/settings'
import { WordListHelp } from './WordListHelp'
import { LlmLog } from './LlmLog'
import { listSnapshots, type Snapshot } from '../flashcards/snapshot'
import { cacheSize, clearCache } from '../background/llm-cache'
import { clearTranscripts, transcriptSize } from '../background/transcript-cache'
import { SectionRail, type RailItem } from '../settings/SectionRail'
import { navigate } from './hooks'
import { useT } from '../i18n/useT'
import type { Translate } from '../i18n/t'
import type { MessageKey } from '../i18n/keys'

function stamp(): string {
  return new Date().toISOString().slice(0, 10)
}

function save(json: string, fileName: string) {
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  URL.revokeObjectURL(url)
}

async function download() {
  save(JSON.stringify(await exportBackup()), `bb-subsgen-${stamp()}.json`)
}

/**
 * The copies taken before a schema migration ran. See flashcards/snapshot.ts.
 *
 * A panel rather than a hidden safety net, because the recovery story is "hand
 * the file to the Import button below" — which is only a story if the file can
 * be got at. Empty for anyone who installed after the migration, and it renders
 * nothing at all rather than an explanation of a thing that never happened.
 */
function DeckSnapshots() {
  const { t } = useT()
  const [snapshots, setSnapshots] = useState<Snapshot[]>([])
  useEffect(() => void listSnapshots().then(setSnapshots, () => setSnapshots([])), [])

  if (!snapshots.length) return null

  return (
    <div class="panel">
      <strong>{t('data.snapshots.title')}</strong>
      <div class="muted small" style={{ marginBottom: 6 }}>
        {t('data.snapshots.blurb')}
      </div>
      {snapshots.map((snapshot) => (
        <div class="row" key={snapshot.fromVersion}>
          <div class="grow small">
            {t('data.snapshots.row', {
              // A schema number is an identifier, not a quantity — grouped as
              // one it would read "1 0" once the deck reaches version ten.
              version: String(snapshot.fromVersion + 1),
              date: new Date(snapshot.at).toISOString().slice(0, 10),
            })}
          </div>
          <button
            onClick={() =>
              save(snapshot.json, `bb-subsgen-before-v${snapshot.fromVersion + 1}.json`)
            }
          >
            {t('data.snapshots.download')}
          </button>
        </div>
      ))}
    </div>
  )
}
/**
 * The two kinds of list, and what each one changes once it is loaded.
 *
 * `label` names the kind rather than the standard behind it — the HSK row is
 * headed with `pack.levelsName`, so a Japanese deck says JLPT and a Chinese one
 * says HSK, and neither is written down here.
 */
const LISTS: Array<{ kind: ListKind; blurb: (pack: LanguagePack, t: Translate) => string }> = [
  {
    kind: 'frequency',
    blurb: (_pack, t) => t('data.lists.frequencyBlurb'),
  },
  {
    kind: 'hsk',
    blurb: (pack, t) => t('data.lists.levelsBlurb', { standard: pack.levelsName }),
  },
]

function labelFor(kind: ListKind, pack: LanguagePack, t: Translate): string {
  return kind === 'frequency'
    ? t('data.lists.frequency')
    : t('data.lists.levels', { standard: pack.levelsName })
}

interface PendingList {
  kind: ListKind
  fileName: string
  list: ParsedList
}

function describe(list: ParsedList, t: Translate): string {
  const { detected } = list
  if (detected.format === 'json') return t('data.shape.json')
  const shape: MessageKey =
    detected.delimiter === '\t'
      ? 'data.shape.tab'
      : detected.delimiter === ','
        ? 'data.shape.comma'
        : 'data.shape.lines'
  // Clauses joined rather than concatenated, so a language that needs a
  // different separator between them changes one string and not this function.
  return [
    t(shape),
    ...(detected.headerSkipped ? [t('data.shape.headerSkipped')] : []),
    ...(detected.wordColumn ? [t('data.shape.wordColumn', { n: detected.wordColumn + 1 })] : []),
  ].join(', ')
}

function WordLists() {
  const { t, lang: uiLang } = useT()
  const [meta, setMeta] = useState<Partial<Record<ListKind, WordListMeta>>>({})
  const [pack, setPack] = useState<LanguagePack | null>(null)
  const [pending, setPending] = useState<PendingList | null>(null)
  const [downloading, setDownloading] = useState<{ id: string; progress: WordListProgress } | null>(
    null,
  )
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  // A list is uploaded *for* the language you study, and both the data and the
  // "which file, how many rows" note are keyed by it — otherwise this panel
  // reports a Chinese HSK upload while you are studying Japanese.
  const refresh = () =>
    void loadSettings().then(async (settings) => {
      const lang = resolveStudyLang(settings)
      setPack(packFor(lang))
      setMeta(await wordListMeta(lang))
    })
  useEffect(refresh, [])

  const onFile = async (kind: ListKind, file: File) => {
    setError('')
    setPending(null)
    // A word list is a list of words in the language you study, so the column
    // sniffing has to know which script it is looking for. Unreachable in
    // practice — the input this fires from only renders once a pack resolved.
    if (!pack) return
    const result = parseWordList(kind, await file.text(), pack)
    if (!result.ok) {
      setError(errorMessage(result.error, t))
      return
    }
    setPending({ kind, fileName: file.name, list: result.list })
  }

  const confirm = async () => {
    if (!pending || !pack) return
    setBusy(true)
    try {
      await replaceWordList(pack.code, pending.kind, pending.list.rows, {
        name: pending.fileName,
        count: pending.list.rows.length,
        uploadedAt: Date.now(),
      })
      setPending(null)
      refresh()
    } finally {
      setBusy(false)
    }
  }

  // No confirmation step, unlike an upload: that exists because an arbitrary
  // file has to be sniffed and the guess shown to someone who can check it. A
  // pinned commit of a known payload has nothing to guess and nothing to check.
  const download = async (source: WordListSource) => {
    setError('')
    setBusy(true)
    setDownloading({ id: source.id, progress: { loaded: 0, total: null } })
    try {
      await installWordList({
        source,
        fetch,
        onProgress: (progress) => setDownloading({ id: source.id, progress }),
      })
      refresh()
    } catch (e) {
      console.warn('[bb-subsgen] word list install failed', e)
      setError(t('data.lists.downloadFailed'))
    } finally {
      setDownloading(null)
      setBusy(false)
    }
  }

  const remove = async (kind: ListKind) => {
    if (!pack) return
    await deleteWordList(pack.code, kind)
    refresh()
  }

  return (
    <div class="panel">
      <strong>{t('data.lists.title')}</strong>
      <div class="muted small" style={{ marginBottom: 6 }}>
        {t('data.lists.blurb')}
      </div>

      {/* Gated on the pack rather than rendered around it. Every label here is
          the language's — 'HSK levels' or 'JLPT levels' — so without one there
          is nothing to head the rows with, and a row headed by an empty string
          reads as a bug rather than as the missing dictionary it is. */}
      {!pack && (
        <>
          <p class="small muted">{t('data.lists.noDictionary')}</p>
          <button onClick={() => navigate('/setup')}>{t('settings.dicts.manage')}</button>
        </>
      )}

      {pack &&
        LISTS.map(({ kind, blurb }) => {
          const loaded = meta[kind]
          const sources = sourcesFor(pack.code, kind)
          return (
            <div class="row" key={kind}>
              <div class="grow">
                <strong>{labelFor(kind, pack, t)}</strong>
                <div class="muted small">
                  {loaded
                    ? t('data.lists.loaded', {
                        name: loaded.name,
                        count: loaded.count,
                        date: new Date(loaded.uploadedAt).toLocaleDateString(uiLang),
                      })
                    : blurb(pack, t)}
                </div>
                {!loaded &&
                  sources.map((source) => (
                    <div class="source" key={source.id}>
                      <div class="muted small">{source.blurb}</div>
                      <p class="hint small">{source.attribution}</p>
                      {downloading?.id === source.id ? (
                        <div
                          class="bar"
                          role="progressbar"
                          aria-valuemin={0}
                          aria-valuemax={downloading.progress.total ?? 0}
                          aria-valuenow={downloading.progress.loaded}
                          aria-label={t('data.lists.downloading')}
                        >
                          <i
                            style={{
                              width: downloading.progress.total
                                ? `${Math.min(100, (downloading.progress.loaded / downloading.progress.total) * 100)}%`
                                : '100%',
                            }}
                          />
                        </div>
                      ) : (
                        <button
                          class="primary"
                          disabled={busy}
                          onClick={() => void download(source)}
                        >
                          {t('data.lists.install', { name: source.label })}
                        </button>
                      )}
                    </div>
                  ))}
                {/* Said rather than left blank: an empty space reads as a bug,
                    and the upload input is the answer to the question it raises. */}
                {!loaded && sources.length === 0 && (
                  <div class="muted small">
                    {t('data.lists.nothingToDownload', { language: pack.name })}
                  </div>
                )}
              </div>
              {loaded ? (
                // Replacing goes through Delete, so "one list at a time" is
                // something you do rather than something you have to infer.
                <button disabled={busy} onClick={() => void remove(kind)}>
                  {t('data.lists.delete')}
                </button>
              ) : (
                <input
                  type="file"
                  accept=".txt,.tsv,.csv,.json,text/plain,application/json"
                  disabled={busy}
                  onChange={(e) => {
                    const file = e.currentTarget.files?.[0]
                    if (file) void onFile(kind, file)
                    e.currentTarget.value = ''
                  }}
                />
              )}
            </div>
          )
        })}

      {error && <p class="small verdict no">{error}</p>}

      {pending && (
        <div class="preview">
          <strong>{t('data.lists.checkFirst')}</strong>
          <p class="small muted">
            {t('data.lists.previewSummary', {
              file: pending.fileName,
              shape: describe(pending.list, t),
              count: pending.list.rows.length,
            })}
          </p>
          <p class="line-zh">{pending.list.sample.join('、')}…</p>
          <p class="small muted">
            {pending.kind === 'frequency'
              ? t('data.lists.previewFrequency', {
                  language: pack?.name ?? t('data.lists.theLanguageYouStudy'),
                })
              : t('data.lists.previewLevels')}
          </p>
          <div class="toolbar">
            <button class="primary" disabled={busy} onClick={() => void confirm()}>
              {t('data.lists.import')}
            </button>
            <button disabled={busy} onClick={() => setPending(null)}>
              {t('data.lists.cancel')}
            </button>
          </div>
        </div>
      )}

      <WordListHelp />
    </div>
  )
}

/**
 * The model's translations, and the button that throws them away.
 *
 * Separate from "Clear everything" and deliberately below it: this costs GPU
 * time to rebuild and nothing else, where that one costs history that cannot be
 * rebuilt at all. Worth being able to wipe on its own — it is the only part of
 * this extension that grows without bound.
 */
function TranslationCache() {
  const { t } = useT()
  const [size, setSize] = useState<{ videos: number; lines: number } | null>(null)

  const refresh = () => void cacheSize().then(setSize, () => setSize(null))
  useEffect(refresh, [])

  const wipe = async () => {
    if (!confirm(t('data.cache.confirm'))) return
    await clearCache()
    refresh()
  }

  return (
    <div class="panel">
      <div class="row">
        <div class="grow">
          <strong>{t('data.cache.title')}</strong>
          <div class="muted small">
            {size?.lines
              ? // `count` picks the plural form, so the video count is the one
                // the sentence agrees with — it is what the noun follows.
                t('data.cache.loaded', {
                  count: size.videos,
                  lines: size.lines,
                  videos: size.videos,
                })
              : t('data.cache.empty')}
          </div>
        </div>
        <button disabled={!size?.lines} onClick={() => void wipe()}>
          {t('data.clear')}
        </button>
      </div>
    </div>
  )
}

/**
 * The transcripts the speech model has produced, and a way to be rid of them.
 *
 * Beside the translation cache rather than inside it, because they are not the
 * same kind of thing to lose. A translation that goes costs you the model's
 * wording and leaves Chrome's on-device version on screen; a transcript that
 * goes leaves a bangumi episode with no subtitles at all until it has been
 * listened to again, which is two or three minutes of fans.
 *
 * Worth offering anyway. These are the largest rows this extension writes — a
 * transcript is every line of a fifty-minute episode — and a model swapped for a
 * Mandarin-tuned one makes every one of them the old model's mistakes, kept
 * under a key nothing will ask for again.
 */
function Transcripts() {
  const { t } = useT()
  const [size, setSize] = useState<{ videos: number; lines: number } | null>(null)

  const refresh = () => void transcriptSize().then(setSize, () => setSize(null))
  useEffect(refresh, [])

  const wipe = async () => {
    if (!confirm(t('data.transcripts.confirm'))) return
    await clearTranscripts()
    refresh()
  }

  return (
    <div class="panel">
      <div class="row">
        <div class="grow">
          <strong>{t('data.transcripts.title')}</strong>
          <div class="muted small">
            {size?.lines
              ? t('data.transcripts.loaded', {
                  count: size.videos,
                  lines: size.lines,
                  videos: size.videos,
                })
              : t('data.transcripts.empty')}
          </div>
        </div>
        <button disabled={!size?.lines} onClick={() => void wipe()}>
          {t('data.clear')}
        </button>
      </div>
    </div>
  )
}

interface Pending {
  incoming: Backup
  local: Backup
  conflicts: Conflict[]
}

/**
 * Getting the deck out and putting it back, and the questions that only arise
 * while putting it back.
 *
 * The conflict panel and the message belong to this component rather than to the
 * tab: they are answers to something the import asked, and an import is the only
 * thing that can ask it.
 */
function Backup() {
  const { t } = useT()
  const [pending, setPending] = useState<Pending | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  const onFile = async (file: File) => {
    setMessage('')
    let parsed: unknown
    try {
      parsed = JSON.parse(await file.text())
    } catch {
      setMessage(t('data.import.badJson'))
      return
    }
    if (!isBackup(parsed)) {
      setMessage(t('data.import.notABackup'))
      return
    }

    // Upgraded at the one point a file enters the app, so conflict detection,
    // the merge and the restore all see a single shape.
    const incoming = upgrade(parsed)

    const local = await exportBackup()
    const conflicts = conflictsOf(local, incoming)

    // Nothing to arbitrate: apply straight away rather than asking a question
    // with one possible answer.
    if (!conflicts.length) {
      await apply(local, incoming, 'local')
      return
    }
    setPending({ incoming, local, conflicts })
  }

  const apply = async (local: Backup, incoming: Backup, prefer: 'local' | 'incoming') => {
    setBusy(true)
    try {
      const merged = merge(local, incoming, { prefer })
      await restore(merged)
      setPending(null)
      setMessage(
        t('data.import.merged', {
          cards: merged.items.length,
          reviews: merged.reviews.length,
        }),
      )
    } catch (e) {
      console.warn('[bb-subsgen] import failed', e)
      setMessage(t('data.import.failed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div class="panel">
        <div class="row">
          <div class="grow">
            <strong>{t('data.export.title')}</strong>
            <div class="muted small">{t('data.export.blurb')}</div>
          </div>
          <button onClick={() => void download()}>{t('data.export.download')}</button>
        </div>
      </div>

      <div class="panel">
        <div class="row">
          <div class="grow">
            <strong>{t('data.import.title')}</strong>
            <div class="muted small">{t('data.import.blurb')}</div>
          </div>
          <input
            type="file"
            accept="application/json,.json"
            disabled={busy}
            onChange={(e) => {
              const file = e.currentTarget.files?.[0]
              if (file) void onFile(file)
              e.currentTarget.value = ''
            }}
          />
        </div>
      </div>

      {pending && (
        <div class="panel">
          <strong>{t('data.conflicts.title', { count: pending.conflicts.length })}</strong>
          <p class="muted small">{t('data.conflicts.blurb')}</p>
          <p class="small">
            {pending.conflicts
              .slice(0, 12)
              .map((c) => c.text)
              .join('、')}
            {pending.conflicts.length > 12 &&
              ` ${t('data.conflicts.more', { count: pending.conflicts.length - 12 })}`}
          </p>
          <div class="toolbar">
            <button
              class="primary"
              disabled={busy}
              onClick={() => void apply(pending.local, pending.incoming, 'local')}
            >
              {t('data.conflicts.keepMine', {
                count: pending.conflicts.filter((c) => c.local).length,
              })}
            </button>
            <button
              disabled={busy}
              onClick={() => void apply(pending.local, pending.incoming, 'incoming')}
            >
              {t('data.conflicts.useFile', {
                count: pending.conflicts.filter((c) => c.incoming).length,
              })}
            </button>
            <button disabled={busy} onClick={() => setPending(null)}>
              {t('data.lists.cancel')}
            </button>
          </div>
        </div>
      )}

      {message && <div class="panel small">{message}</div>}
    </>
  )
}

/**
 * The nuclear option, with its own message.
 *
 * It reports separately from the import above because the two now render in
 * different sections of the tab — a shared message string would announce
 * "Everything cleared." into a pane the user is no longer looking at.
 */
function ClearEverything() {
  const { t } = useT()
  const [message, setMessage] = useState('')

  const clearEverything = async () => {
    if (!confirm(t('data.clearAll.confirm'))) return
    await restore(emptyBackup())
    setMessage(t('data.clearAll.done'))
  }

  return (
    <>
      <div class="panel">
        <div class="row">
          <div class="grow">
            <strong>{t('data.clearAll.title')}</strong>
            <div class="muted small">{t('data.clearAll.blurb')}</div>
          </div>
          <button onClick={() => void clearEverything()}>{t('data.clear')}</button>
        </div>
      </div>

      {message && <div class="panel small">{message}</div>}
    </>
  )
}

/**
 * The rail, and with it the `#/data/<slug>` routes. Resolved in App.tsx, like
 * `/videos/:id`, which is why the slugs and not the labels are the tuple.
 */
export const DATA_SLUGS = ['backup', 'word-lists', 'storage', 'diagnostics'] as const

export type DataSection = (typeof DATA_SLUGS)[number]

const sections = (t: Translate): readonly RailItem<DataSection>[] => [
  { slug: 'backup', label: t('data.rail.backup') },
  { slug: 'word-lists', label: t('data.rail.wordLists') },
  { slug: 'storage', label: t('data.rail.storage') },
  { slug: 'diagnostics', label: t('data.rail.diagnostics') },
]

export function Data({ section }: { section: DataSection }) {
  const { t } = useT()

  return (
    <div class="section-layout">
      <SectionRail
        items={sections(t)}
        active={section}
        onSelect={(slug) => navigate(`/data/${slug}`)}
      />

      <div class="section-pane">
        {section === 'backup' && (
          <>
            <Backup />
            <DeckSnapshots />
          </>
        )}

        {section === 'word-lists' && <WordLists />}

        {/* Clear-everything stays above the two caches, as it was before the
            sections: the panels below cost GPU time to rebuild, this one costs
            history that cannot be rebuilt at all, and the order is what says so. */}
        {section === 'storage' && (
          <>
            <ClearEverything />
            <TranslationCache />
            <Transcripts />
          </>
        )}

        {section === 'diagnostics' && <LlmLog />}
      </div>
    </div>
  )
}
