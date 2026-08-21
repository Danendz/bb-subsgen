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
import { WordListHelp } from './WordListHelp'
import { LlmLog } from './LlmLog'
import { cacheSize, clearCache } from '../background/llm-cache'
import { clearTranscripts, transcriptSize } from '../background/transcript-cache'

function stamp(): string {
  return new Date().toISOString().slice(0, 10)
}

async function download() {
  const backup = await exportBackup()
  const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)

  const a = document.createElement('a')
  a.href = url
  a.download = `bb-subsgen-${stamp()}.json`
  a.click()
  URL.revokeObjectURL(url)
}

const LISTS: Array<{ kind: ListKind; label: string; blurb: string }> = [
  {
    kind: 'frequency',
    label: 'Frequency list',
    blurb: 'Orders which new words you meet first, and gives progress a denominator.',
  },
  {
    kind: 'hsk',
    label: 'HSK levels',
    blurb: 'Groups the dictionary by level and adds the progress bars on Overview.',
  },
]

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
  const [pending, setPending] = useState<PendingList | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const refresh = () => void wordListMeta().then(setMeta)
  useEffect(refresh, [])

  const onFile = async (kind: ListKind, file: File) => {
    setError('')
    setPending(null)
    const result = parseWordList(kind, await file.text())
    if (!result.ok) {
      setError(errorMessage(result.error))
      return
    }
    setPending({ kind, fileName: file.name, list: result.list })
  }

  const confirm = async () => {
    if (!pending) return
    setBusy(true)
    try {
      await replaceWordList(pending.kind, pending.list.rows, {
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

  const remove = async (kind: ListKind) => {
    await deleteWordList(kind)
    refresh()
  }

  return (
    <div class="panel">
      <strong>Word lists</strong>
      <div class="muted small" style={{ marginBottom: 6 }}>
        Optional, and supplied by you — the extension bundles none.
      </div>

      {LISTS.map(({ kind, label, blurb }) => {
        const loaded = meta[kind]
        return (
          <div class="row" key={kind}>
            <div class="grow">
              <strong>{label}</strong>
              <div class="muted small">
                {loaded
                  ? `${loaded.name} — ${loaded.count.toLocaleString()} words, added ${new Date(loaded.uploadedAt).toLocaleDateString()}`
                  : blurb}
              </div>
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
              ? 'Those should be among the commonest words in Chinese. If they are not, the file is not sorted by frequency.'
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

export function Data() {
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

  const clearEverything = async () => {
    if (!confirm('Delete every card, review and count? This cannot be undone.')) return
    await restore(emptyBackup())
    setMessage('Everything cleared.')
  }

  return (
    <>
      <WordLists />

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

      <TranslationCache />
      <Transcripts />
      <LlmLog />
    </>
  )
}
