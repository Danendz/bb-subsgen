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
  const [snapshots, setSnapshots] = useState<Snapshot[]>([])
  useEffect(() => void listSnapshots().then(setSnapshots, () => setSnapshots([])), [])

  if (!snapshots.length) return null

  return (
    <div class="panel">
      <strong>Deck snapshots</strong>
      <div class="muted small" style={{ marginBottom: 6 }}>
        Taken automatically just before a database upgrade rewrote the deck. Download one and hand
        it to Import below if an upgrade lost something.
      </div>
      {snapshots.map((snapshot) => (
        <div class="row" key={snapshot.fromVersion}>
          <div class="grow small">
            Before schema {snapshot.fromVersion + 1}, taken{' '}
            {new Date(snapshot.at).toISOString().slice(0, 10)}
          </div>
          <button
            onClick={() =>
              save(snapshot.json, `bb-subsgen-before-v${snapshot.fromVersion + 1}.json`)
            }
          >
            Download
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
const LISTS: Array<{ kind: ListKind; blurb: (pack: LanguagePack) => string }> = [
  {
    kind: 'frequency',
    blurb: () => 'Orders which new words you meet first, and gives progress a denominator.',
  },
  {
    kind: 'hsk',
    blurb: (pack) =>
      `Groups the dictionary by ${pack.levelsName} level and adds the progress bars on Overview.`,
  },
]

function labelFor(kind: ListKind, pack: LanguagePack): string {
  return kind === 'frequency' ? 'Frequency list' : `${pack.levelsName} levels`
}

interface PendingList {
  kind: ListKind
  fileName: string
  list: ParsedList
}

function describe(list: ParsedList): string {
  const { detected } = list
  if (detected.format === 'json') return 'JSON'
  const shape =
    detected.delimiter === '\t'
      ? 'tab-separated'
      : detected.delimiter === ','
        ? 'comma-separated'
        : 'one word per line'
  const header = detected.headerSkipped ? ', header skipped' : ''
  const column = detected.wordColumn ? `, words in column ${detected.wordColumn + 1}` : ''
  return `${shape}${header}${column}`
}

function WordLists() {
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
      setError(errorMessage(result.error))
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
      setError('Could not download the list. Check your connection and try again.')
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
      <strong>Word lists</strong>
      <div class="muted small" style={{ marginBottom: 6 }}>
        Optional. None ships with the extension, but the ones below download on demand.
      </div>

      {/* Gated on the pack rather than rendered around it. Every label here is
          the language's — 'HSK levels' or 'JLPT levels' — so without one there
          is nothing to head the rows with, and a row headed by an empty string
          reads as a bug rather than as the missing dictionary it is. */}
      {!pack && (
        <>
          <p class="small muted">
            No dictionary installed yet, so there is no language to file a list under.
          </p>
          <button onClick={() => navigate('/setup')}>Manage dictionaries</button>
        </>
      )}

      {pack &&
        LISTS.map(({ kind, blurb }) => {
          const loaded = meta[kind]
          const sources = sourcesFor(pack.code, kind)
          return (
            <div class="row" key={kind}>
              <div class="grow">
                <strong>{labelFor(kind, pack)}</strong>
                <div class="muted small">
                  {loaded
                    ? `${loaded.name} — ${loaded.count.toLocaleString()} words, added ${new Date(loaded.uploadedAt).toLocaleDateString()}`
                    : blurb(pack)}
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
                          aria-label="Downloading"
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
                          Install {source.label}
                        </button>
                      )}
                    </div>
                  ))}
                {/* Said rather than left blank: an empty space reads as a bug,
                    and the upload input is the answer to the question it raises. */}
                {!loaded && sources.length === 0 && (
                  <div class="muted small">
                    Nothing to download for {pack.name} yet — upload your own file below.
                  </div>
                )}
              </div>
              {loaded ? (
                // Replacing goes through Delete, so "one list at a time" is
                // something you do rather than something you have to infer.
                <button disabled={busy} onClick={() => void remove(kind)}>
                  Delete
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
          <strong>Check this before importing</strong>
          <p class="small muted">
            {pending.fileName} — {describe(pending.list)} —{' '}
            {pending.list.rows.length.toLocaleString()} words
          </p>
          <p class="line-zh">{pending.list.sample.join('、')}…</p>
          <p class="small muted">
            {pending.kind === 'frequency'
              ? `Those should be among the commonest words in ${pack?.name ?? 'the language you study'}. If they are not, the file is not sorted by frequency.`
              : 'Levels are read from the file as given.'}
          </p>
          <div class="toolbar">
            <button class="primary" disabled={busy} onClick={() => void confirm()}>
              Import
            </button>
            <button disabled={busy} onClick={() => setPending(null)}>
              Cancel
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
  const [size, setSize] = useState<{ videos: number; lines: number } | null>(null)

  const refresh = () => void cacheSize().then(setSize, () => setSize(null))
  useEffect(refresh, [])

  const wipe = async () => {
    if (!confirm('Delete every translation the local model has produced?')) return
    await clearCache()
    refresh()
  }

  return (
    <div class="panel">
      <div class="row">
        <div class="grow">
          <strong>Model translations</strong>
          <div class="muted small">
            {size?.lines
              ? `${size.lines.toLocaleString()} lines across ${size.videos} video${size.videos === 1 ? '' : 's'}. ` +
                'Kept so a second viewing is instant instead of costing the same half hour again.'
              : 'Nothing cached yet. Subtitle lines the local model translates are kept here, so rewatching costs nothing.'}
          </div>
        </div>
        <button disabled={!size?.lines} onClick={() => void wipe()}>
          Clear
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
  const [size, setSize] = useState<{ videos: number; lines: number } | null>(null)

  const refresh = () => void transcriptSize().then(setSize, () => setSize(null))
  useEffect(refresh, [])

  const wipe = async () => {
    if (
      !confirm(
        'Delete every transcript? Videos with no subtitle track of their own will have ' +
          'to be transcribed again before they show any lines.',
      )
    ) {
      return
    }
    await clearTranscripts()
    refresh()
  }

  return (
    <div class="panel">
      <div class="row">
        <div class="grow">
          <strong>Transcripts</strong>
          <div class="muted small">
            {size?.lines
              ? `${size.lines.toLocaleString()} lines across ${size.videos} video${size.videos === 1 ? '' : 's'}. ` +
                'Kept so an episode is listened to once ever, rather than once per viewing.'
              : 'Nothing transcribed yet. Lines the speech model hears in videos with no subtitle ' +
                'track are kept here, so watching one again costs nothing.'}
          </div>
        </div>
        <button disabled={!size?.lines} onClick={() => void wipe()}>
          Clear
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
  const [pending, setPending] = useState<Pending | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  const onFile = async (file: File) => {
    setMessage('')
    let parsed: unknown
    try {
      parsed = JSON.parse(await file.text())
    } catch {
      setMessage('That file is not valid JSON.')
      return
    }
    if (!isBackup(parsed)) {
      setMessage('That does not look like a bb-subsgen export.')
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
        `Merged. ${merged.items.length.toLocaleString()} cards and ` +
          `${merged.reviews.length.toLocaleString()} reviews in total.`,
      )
    } catch (e) {
      console.warn('[bb-subsgen] import failed', e)
      setMessage('Import failed — nothing was changed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div class="panel">
        <div class="row">
          <div class="grow">
            <strong>Export</strong>
            <div class="muted small">
              One JSON file with every card, the full review log, exposure counts and video history.
              Dwell samples and word lists are left out — the first is calibration for this machine,
              the second you load per browser.
            </div>
          </div>
          <button onClick={() => void download()}>Download</button>
        </div>
      </div>

      <div class="panel">
        <div class="row">
          <div class="grow">
            <strong>Import</strong>
            <div class="muted small">
              Merged, not replaced. Review logs from both sides are combined and the schedule is
              recomputed from them, so studying you did in another browser still counts. Counts add
              up and videos merge by id.
            </div>
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
          <strong>
            {pending.conflicts.length} word{pending.conflicts.length === 1 ? '' : 's'} disagree
          </strong>
          <p class="muted small">
            These are marked known on one side and not the other. Everything else merges on its own
            — only a declaration has no evidence to settle it.
          </p>
          <p class="small">
            {pending.conflicts
              .slice(0, 12)
              .map((c) => c.text)
              .join('、')}
            {pending.conflicts.length > 12 && ` … +${pending.conflicts.length - 12}`}
          </p>
          <div class="toolbar">
            <button
              class="primary"
              disabled={busy}
              onClick={() => void apply(pending.local, pending.incoming, 'local')}
            >
              Keep mine ({pending.conflicts.filter((c) => c.local).length} stay known)
            </button>
            <button
              disabled={busy}
              onClick={() => void apply(pending.local, pending.incoming, 'incoming')}
            >
              Use the file ({pending.conflicts.filter((c) => c.incoming).length} become known)
            </button>
            <button disabled={busy} onClick={() => setPending(null)}>
              Cancel
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
  const [message, setMessage] = useState('')

  const clearEverything = async () => {
    if (!confirm('Delete every card, review and count? This cannot be undone.')) return
    await restore(emptyBackup())
    setMessage('Everything cleared.')
  }

  return (
    <>
      <div class="panel">
        <div class="row">
          <div class="grow">
            <strong>Clear everything</strong>
            <div class="muted small">
              Deletes all cards, reviews and counts. Word lists are kept. Export first — there is no
              undo.
            </div>
          </div>
          <button onClick={() => void clearEverything()}>Clear</button>
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

const SECTIONS: readonly RailItem<DataSection>[] = [
  { slug: 'backup', label: 'Backup' },
  { slug: 'word-lists', label: 'Word lists' },
  { slug: 'storage', label: 'Storage' },
  { slug: 'diagnostics', label: 'Diagnostics' },
]

export function Data({ section }: { section: DataSection }) {
  return (
    <div class="section-layout">
      <SectionRail
        items={SECTIONS}
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
