// The pieces every settings row is made of.
//
// Shared by the popup and the settings tab, which is the whole point: a setting
// that exists in two places and is written twice is a setting that will one day
// disagree with itself. The markup is identical in both; only the stylesheets
// differ, so the same row reads as a compact popup line or as a panel row
// without either host knowing about the other.

import type { ComponentChildren } from 'preact'
import { useEffect, useState } from 'preact/hooks'
import { listVoices } from '../shared/speak'
import { useT } from '../i18n/useT'

export function Section({ title, children }: { title: string; children: ComponentChildren }) {
  return (
    <section class="settings-group">
      <h2>{title}</h2>
      {children}
    </section>
  )
}

/** The paragraph under a group explaining what it costs you to turn it on. */
export function Hint({ children }: { children: ComponentChildren }) {
  return <p class="hint">{children}</p>
}

export function Toggle({
  label,
  checked,
  disabled = false,
  onChange,
}: {
  label: string
  checked: boolean
  disabled?: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label class="row">
      <span class="grow">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.currentTarget.checked)}
      />
    </label>
  )
}

export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  suffix = '',
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  suffix?: string
  onChange: (v: number) => void
}) {
  return (
    <label class="row">
      <span class="grow">
        {label}{' '}
        <span class="value">
          {value}
          {suffix}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onInput={(e) => onChange(Number(e.currentTarget.value))}
      />
    </label>
  )
}

export function Select<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: ReadonlyArray<{ code: T; label: string }>
  onChange: (v: T) => void
}) {
  return (
    <label class="row">
      <span class="grow">{label}</span>
      <select value={value} onChange={(e) => onChange(e.currentTarget.value as T)}>
        {options.map((option) => (
          <option key={option.code} value={option.code}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}

/**
 * A model picker whose options are whatever the server reported.
 *
 * The saved value is always offered even when the list doesn't contain it, so a
 * model that is configured but not currently loaded stays visible rather than
 * silently resetting to nothing.
 */
export function ModelSelect({
  label,
  value,
  models,
  onChange,
}: {
  label: string
  value: string
  models: string[]
  onChange: (v: string) => void
}) {
  const { t } = useT()
  const options = Array.from(new Set([value, ...models].filter(Boolean)))

  return (
    <label class="row">
      <span class="grow">{label}</span>
      <select class="model" value={value} onChange={(e) => onChange(e.currentTarget.value)}>
        <option value="">{t('controls.notSet')}</option>
        {options.map((id) => (
          <option key={id} value={id}>
            {id}
          </option>
        ))}
      </select>
    </label>
  )
}

/**
 * The voices this browser has for the languages in scope, best first.
 *
 * `getVoices()` comes back empty on the first call and fills in later. In a
 * popup that is the normal case rather than the edge one — the window is opened
 * and measured well inside that gap — and `voiceschanged` does not reliably fire
 * in a page this short-lived, so listening alone leaves the picker empty. Hence
 * the poll as well, which stops as soon as anything arrives.
 */
export function useVoices(voiceLangs: readonly string[]): SpeechSynthesisVoice[] {
  // Joined rather than passed as an array: the caller derives it per render, so
  // a new array every time would re-run the effect on every render.
  const key = voiceLangs.join(' ')
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>(() => listVoices(voiceLangs))
  const found = voices.length > 0

  useEffect(() => {
    const langs = key ? key.split(' ') : []
    const refresh = () => setVoices(listVoices(langs))
    refresh()
    if (found) return

    speechSynthesis.addEventListener('voiceschanged', refresh)
    const timer = setInterval(refresh, 150)

    return () => {
      speechSynthesis.removeEventListener('voiceschanged', refresh)
      clearInterval(timer)
    }
  }, [key, found])

  return voices
}
