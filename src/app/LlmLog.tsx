import { useCallback, useState } from 'preact/hooks'
import { clearLog, filterEntries, formatLogEntry, readLog } from '../llm/log'
import type { LlmLogEntry, LlmLogKind, LlmLogLevel } from '../llm/types'
import { useAsync } from './hooks'
import { useT } from '../i18n/useT'
import type { MessageKey } from '../i18n/keys'

const LEVELS: ReadonlyArray<{ value: LlmLogLevel | 'all'; label: MessageKey }> = [
  { value: 'all', label: 'log.level.all' },
  // The default: the two things you open a log to find.
  { value: 'warn', label: 'log.level.warn' },
  { value: 'error', label: 'log.level.error' },
]

const KINDS: ReadonlyArray<{ value: LlmLogKind | 'all'; label: MessageKey }> = [
  { value: 'all', label: 'log.kind.all' },
  { value: 'chat', label: 'log.kind.chat' },
  { value: 'explain', label: 'log.kind.explain' },
  { value: 'translate-batch', label: 'log.kind.translate' },
  { value: 'models', label: 'log.kind.models' },
  { value: 'connect', label: 'log.kind.connect' },
]

function Row({ entry }: { entry: LlmLogEntry }) {
  const { t, lang } = useT()
  const [open, setOpen] = useState(false)

  return (
    <div class={`log-row ${entry.level}`}>
      <button class="row-btn log-head" onClick={() => setOpen((v) => !v)}>
        <span class="log-time">{new Date(entry.at).toLocaleTimeString(lang)}</span>
        <span class={`tag log-level ${entry.level}`}>{entry.level}</span>
        <span class="tag">{entry.kind}</span>
        <span class="grow log-message">{entry.message}</span>
        {entry.durationMs !== undefined && (
          <span class="muted small">{t('log.duration', { ms: entry.durationMs })}</span>
        )}
        {entry.detail && <span class="muted small">{open ? '▾' : '▸'}</span>}
      </button>

      {open && (
        <div class="log-detail">
          <div class="muted small">
            {/* The id is what ties a request to its reply and its retry. */}
            {t('log.request', { id: entry.requestId })}
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
  const { t } = useT()
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
          <strong>{t('log.title')}</strong>
          <div class="muted small">{t('log.blurb')}</div>
        </div>
      </div>

      <div class="toolbar">
        <select
          class="model"
          value={level}
          onChange={(e) => setLevel(e.currentTarget.value as LlmLogLevel)}
        >
          {LEVELS.map((option) => (
            <option key={option.value} value={option.value}>
              {t(option.label)}
            </option>
          ))}
        </select>
        <select
          class="model"
          value={kind}
          onChange={(e) => setKind(e.currentTarget.value as LlmLogKind)}
        >
          {KINDS.map((option) => (
            <option key={option.value} value={option.value}>
              {t(option.label)}
            </option>
          ))}
        </select>
        <span class="grow" />
        <button onClick={refresh}>{t('log.refresh')}</button>
        <button disabled={!shown.length} onClick={copyAll}>
          {t('log.copy')}
        </button>
        <button disabled={!entries?.length} onClick={() => void wipe()}>
          {t('log.clear')}
        </button>
      </div>

      {loading ? (
        <p class="muted small">{t('log.reading')}</p>
      ) : shown.length === 0 ? (
        <p class="muted small">{entries?.length ? t('log.noMatches') : t('log.empty')}</p>
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
