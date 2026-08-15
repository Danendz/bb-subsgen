import { useCallback, useState } from 'preact/hooks'
import { clearLog, filterEntries, formatLogEntry, readLog } from '../llm/log'
import type { LlmLogEntry, LlmLogKind, LlmLogLevel } from '../llm/types'
import { useAsync } from './hooks'

const LEVELS: ReadonlyArray<{ value: LlmLogLevel | 'all'; label: string }> = [
  { value: 'all', label: 'Everything' },
  // The default: the two things you open a log to find.
  { value: 'warn', label: 'Warnings and errors' },
  { value: 'error', label: 'Errors only' },
]

const KINDS: ReadonlyArray<{ value: LlmLogKind | 'all'; label: string }> = [
  { value: 'all', label: 'All activity' },
  { value: 'chat', label: 'Chat' },
  { value: 'explain', label: 'Explain' },
  { value: 'translate-batch', label: 'Translation' },
  { value: 'models', label: 'Model list' },
  { value: 'connect', label: 'Connection' },
]

function time(at: number): string {
  return new Date(at).toLocaleTimeString()
}

function Row({ entry }: { entry: LlmLogEntry }) {
  const [open, setOpen] = useState(false)

  return (
    <div class={`log-row ${entry.level}`}>
      <button class="row-btn log-head" onClick={() => setOpen((v) => !v)}>
        <span class="log-time">{time(entry.at)}</span>
        <span class={`tag log-level ${entry.level}`}>{entry.level}</span>
        <span class="tag">{entry.kind}</span>
        <span class="grow log-message">{entry.message}</span>
        {entry.durationMs !== undefined && <span class="muted small">{entry.durationMs}ms</span>}
        {entry.detail && <span class="muted small">{open ? '▾' : '▸'}</span>}
      </button>

      {open && (
        <div class="log-detail">
          <div class="muted small">
            {/* The id is what ties a request to its reply and its retry. */}
            request {entry.requestId}
            {entry.model ? ` · ${entry.model}` : ''}
            {entry.status !== undefined ? ` · HTTP ${entry.status}` : ''}
          </div>
          {entry.detail && <pre>{entry.detail}</pre>}
        </div>
      )}
    </div>
  )
}

/**
 * The LLM debug log.
 *
 * Lives in Data rather than as a sixth tab: it is a diagnostic, and the nav is
 * for the things you came to the app to do.
 */
export function LlmLog() {
  const [level, setLevel] = useState<LlmLogLevel | 'all'>('all')
  const [kind, setKind] = useState<LlmLogKind | 'all'>('all')
  const [nonce, setNonce] = useState(0)

  const load = useCallback(() => readLog(), [nonce])
  const { data: entries, loading } = useAsync(load)
  const refresh = () => setNonce((n) => n + 1)

  const shown = filterEntries(entries ?? [], level, kind)

  const copyAll = () => {
    void navigator.clipboard.writeText(shown.map(formatLogEntry).join('\n'))
  }

  const wipe = async () => {
    await clearLog()
    refresh()
  }

  return (
    <div class="panel">
      <div class="row">
        <div class="grow">
          <strong>Model log</strong>
          <div class="muted small">
            Every request the local model was sent, and everything that came back or went wrong.
            Newest first, capped at the last 500. Also mirrored to the browser console.
          </div>
        </div>
      </div>

      <div class="toolbar">
        <select class="model" value={level} onChange={(e) => setLevel(e.currentTarget.value as LlmLogLevel)}>
          {LEVELS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <select class="model" value={kind} onChange={(e) => setKind(e.currentTarget.value as LlmLogKind)}>
          {KINDS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <span class="grow" />
        <button onClick={refresh}>Refresh</button>
        <button disabled={!shown.length} onClick={copyAll}>
          Copy
        </button>
        <button disabled={!entries?.length} onClick={() => void wipe()}>
          Clear
        </button>
      </div>

      {loading ? (
        <p class="muted small">Reading…</p>
      ) : shown.length === 0 ? (
        <p class="muted small">
          {entries?.length
            ? 'Nothing matches those filters.'
            : 'Nothing logged yet. Anything the model is asked will show up here.'}
        </p>
      ) : (
        <div class="log">
          {shown.map((entry) => (
            <Row key={entry.seq} entry={entry} />
          ))}
        </div>
      )}
    </div>
  )
}
