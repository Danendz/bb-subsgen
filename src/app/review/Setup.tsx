// Choosing how a session works, before it starts.
//
// Saved rather than asked each time: this is a daily habit, and a habit that
// makes you restate your preferences every morning is one you stop having. The
// summary stays on screen when the panel is closed, so what you are about to
// study is never hidden behind a menu.

import type { StudyInclude, StudyMode } from '../../flashcards/types'
import { MAX_SESSION_SIZE, MIN_SESSION_SIZE } from '../../shared/settings'
import { useT } from '../../i18n/useT'
import type { Translate } from '../../i18n/t'
import type { MessageKey } from '../../i18n/keys'

export interface SessionSetup {
  studyMode: StudyMode
  studyInclude: StudyInclude
  studySessionSize: number
}

// Keys rather than strings: these tables are module-level and `t` is only
// available once a component is rendering.
const MODES: ReadonlyArray<{ value: StudyMode; label: MessageKey; hint: MessageKey }> = [
  { value: 'mixed', label: 'setup.mode.mixed', hint: 'setup.mode.mixedHint' },
  { value: 'remember', label: 'setup.mode.remember', hint: 'setup.mode.rememberHint' },
  { value: 'type', label: 'setup.mode.type', hint: 'setup.mode.typeHint' },
  { value: 'audio', label: 'setup.mode.audio', hint: 'setup.mode.audioHint' },
]

const INCLUDES: ReadonlyArray<{ value: StudyInclude; label: MessageKey }> = [
  { value: 'both', label: 'setup.include.both' },
  { value: 'words', label: 'setup.include.words' },
  { value: 'sentences', label: 'setup.include.sentences' },
  { value: 'grammar', label: 'setup.include.grammar' },
]

const MODE_KEY: Record<StudyMode, MessageKey> = {
  mixed: 'setup.mode.mixed',
  remember: 'setup.mode.remember',
  type: 'setup.mode.type',
  audio: 'setup.mode.audio',
}

const INCLUDE_KEY: Record<StudyInclude, MessageKey> = {
  both: 'setup.summary.both',
  words: 'setup.summary.words',
  sentences: 'setup.summary.sentences',
  grammar: 'setup.summary.grammar',
}

export function setupSummary(setup: SessionSetup, t: Translate): string {
  return t('setup.summary', {
    mode: t(MODE_KEY[setup.studyMode]),
    include: t(INCLUDE_KEY[setup.studyInclude]),
    count: setup.studySessionSize,
  })
}

export interface SetupProps {
  setup: SessionSetup
  /**
   * False when the machine has no voice for the deck's language, which rules
   * listening out. Resolved by the caller, which holds the pack.
   */
  canSpeak: boolean
  onChange: (patch: Partial<SessionSetup>) => void
}

export function Setup({ setup, canSpeak, onChange }: SetupProps) {
  const { t } = useT()

  return (
    <div class="setup">
      <fieldset class="setup-group">
        <legend>{t('setup.howAsked')}</legend>
        <div class="choices">
          {MODES.map((mode) => {
            // Listening is the one mode the machine can veto: without a voice
            // for the language there is no question to hear.
            const unavailable = mode.value === 'audio' && !canSpeak
            return (
              <button
                key={mode.value}
                type="button"
                class={`choice ${setup.studyMode === mode.value ? 'on' : ''}`}
                aria-pressed={setup.studyMode === mode.value}
                disabled={unavailable}
                title={unavailable ? t('setup.mode.noVoiceTitle') : undefined}
                onClick={() => onChange({ studyMode: mode.value })}
              >
                <span class="choice-label">{t(mode.label)}</span>
                <span class="choice-hint">
                  {unavailable ? t('setup.mode.noVoiceHint') : t(mode.hint)}
                </span>
              </button>
            )
          })}
        </div>
      </fieldset>

      <fieldset class="setup-group">
        <legend>{t('setup.whatIncluded')}</legend>
        <div class="choices row">
          {INCLUDES.map((option) => (
            <button
              key={option.value}
              type="button"
              class={`choice ${setup.studyInclude === option.value ? 'on' : ''}`}
              aria-pressed={setup.studyInclude === option.value}
              onClick={() => onChange({ studyInclude: option.value })}
            >
              <span class="choice-label">{t(option.label)}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset class="setup-group">
        <legend>
          {t('setup.length')} <span class="size-readout">{setup.studySessionSize}</span>
        </legend>
        <input
          type="range"
          class="size-range"
          min={MIN_SESSION_SIZE}
          max={MAX_SESSION_SIZE}
          step={5}
          value={setup.studySessionSize}
          aria-label={t('setup.lengthAria')}
          onInput={(e) => onChange({ studySessionSize: Number(e.currentTarget.value) })}
        />
        <p class="setup-note small muted">{t('setup.lengthNote')}</p>
      </fieldset>
    </div>
  )
}
