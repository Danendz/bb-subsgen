import { useEffect, useState } from 'preact/hooks'
import {
  conflictsOf,
  emptyBackup,
  isBackup,
  merge,
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
  const shape = detected.delimiter === '\t' ? 'tab-separated' : detected.delimiter === ',' ? 'comma-separated' : 'one word per line'
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

    const local = await exportBackup()
    const conflicts = conflictsOf(local, parsed)

    // Nothing to arbitrate: apply straight away rather than asking a question
    // with one possible answer.
    if (!conflicts.length) {
      await apply(local, parsed, 'local')
      return
    }
    setPending({ incoming: parsed, local, conflicts })
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
              One JSON file with every card, the full review log, exposure counts and video
              history. Dwell samples and word lists are left out — the first is calibration for
              this machine, the second you load per browser.
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
              recomputed from them, so studying you did in another browser still counts. Counts
              add up and videos merge by id.
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
            These are marked known on one side and not the other. Everything else merges on its
            own — only a declaration has no evidence to settle it.
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
              Deletes all cards, reviews and counts. Word lists are kept. Export first — there is
              no undo.
            </div>
          </div>
          <button onClick={() => void clearEverything()}>Clear</button>
        </div>
      </div>
    </>
  )
}
