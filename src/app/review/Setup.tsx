// Choosing how a session works, before it starts.
//
// Saved rather than asked each time: this is a daily habit, and a habit that
// makes you restate your preferences every morning is one you stop having. The
// summary stays on screen when the panel is closed, so what you are about to
// study is never hidden behind a menu.

import type { StudyInclude, StudyMode } from '../../flashcards/types'
import { MAX_SESSION_SIZE, MIN_SESSION_SIZE } from '../../shared/settings'
import type { DictSource } from '../../dict/sources'
import { Flag } from '../flags'

export interface SessionSetup {
  /**
   * Which language's lexicon the session segments against.
   *
   * A real `Settings` key rather than local state, because `change` in
   * Review.tsx writes every key of this straight to `saveSettings` — and
   * because it is shared with the Dictionary tab on purpose.
   */
  studyLang: string
  studyMode: StudyMode
  studyInclude: StudyInclude
  studySessionSize: number
}

const MODES: ReadonlyArray<{ value: StudyMode; label: string; hint: string }> = [
  { value: 'mixed', label: 'Mixed', hint: 'A different angle each sitting' },
  { value: 'remember', label: 'Remembering', hint: 'Recall it, then say how it went' },
  { value: 'type', label: 'Typing', hint: 'Build it from the meaning' },
  { value: 'audio', label: 'Listening', hint: 'Build it from the sound' },
]

const INCLUDES: ReadonlyArray<{ value: StudyInclude; label: string }> = [
  { value: 'both', label: 'Everything' },
  { value: 'words', label: 'Words only' },
  { value: 'sentences', label: 'Lines only' },
  { value: 'grammar', label: 'Grammar only' },
]

const MODE_LABEL: Record<StudyMode, string> = {
  mixed: 'Mixed',
  remember: 'Remembering',
  type: 'Typing',
  audio: 'Listening',
}

const INCLUDE_LABEL: Record<StudyInclude, string> = {
  both: 'words + lines + grammar',
  words: 'words only',
  sentences: 'lines only',
  grammar: 'grammar only',
}

export function setupSummary(setup: SessionSetup): string {
  return `${MODE_LABEL[setup.studyMode]} · ${INCLUDE_LABEL[setup.studyInclude]} · ${setup.studySessionSize} cards`
}

export interface SetupProps {
  setup: SessionSetup
  /** False when the machine has no Mandarin voice, which rules listening out. */
  canSpeak: boolean
  /**
   * Languages with a dictionary installed, resolved by the caller.
   *
   * A prop rather than a read from here, for the same reason `canSpeak` is one:
   * this component renders a saved setup and reports changes to it, and nothing
   * in it opens a database.
   */
  languages: DictSource[]
  onChange: (patch: Partial<SessionSetup>) => void
}

export function Setup({ setup, canSpeak, languages, onChange }: SetupProps) {
  return (
    <div class="setup">
      {/*
        Hidden at one language: there is nothing to choose between, and a
        control whose only option is already selected is worse than no control.
      */}
      {languages.length > 1 && (
        <fieldset class="setup-group">
          <legend>Which language</legend>
          <div class="choices row">
            {languages.map((source) => (
              <button
                key={source.lang}
                type="button"
                class={`choice lang-card ${setup.studyLang === source.lang ? 'on' : ''}`}
                aria-pressed={setup.studyLang === source.lang}
                onClick={() => onChange({ studyLang: source.lang })}
              >
                <Flag lang={source.lang} />
                <span class="choice-label">{source.langName}</span>
              </button>
            ))}
          </div>
        </fieldset>
      )}

      <fieldset class="setup-group">
        <legend>How you are asked</legend>
        <div class="choices">
          {MODES.map((mode) => {
            // Listening is the one mode the machine can veto: without a
            // Mandarin voice there is no question to hear.
            const unavailable = mode.value === 'audio' && !canSpeak
            return (
              <button
                key={mode.value}
                type="button"
                class={`choice ${setup.studyMode === mode.value ? 'on' : ''}`}
                aria-pressed={setup.studyMode === mode.value}
                disabled={unavailable}
                title={unavailable ? 'No Mandarin voice is installed on this computer' : undefined}
                onClick={() => onChange({ studyMode: mode.value })}
              >
                <span class="choice-label">{mode.label}</span>
                <span class="choice-hint">
                  {unavailable ? 'No Mandarin voice installed' : mode.hint}
                </span>
              </button>
            )
          })}
        </div>
      </fieldset>

      <fieldset class="setup-group">
        <legend>What is included</legend>
        <div class="choices row">
          {INCLUDES.map((option) => (
            <button
              key={option.value}
              type="button"
              class={`choice ${setup.studyInclude === option.value ? 'on' : ''}`}
              aria-pressed={setup.studyInclude === option.value}
              onClick={() => onChange({ studyInclude: option.value })}
            >
              <span class="choice-label">{option.label}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset class="setup-group">
        <legend>
          Session length <span class="size-readout">{setup.studySessionSize}</span>
        </legend>
        <input
          type="range"
          class="size-range"
          min={MIN_SESSION_SIZE}
          max={MAX_SESSION_SIZE}
          step={5}
          value={setup.studySessionSize}
          aria-label="Cards per session"
          onInput={(e) => onChange({ studySessionSize: Number(e.currentTarget.value) })}
        />
        <p class="setup-note small muted">
          Counted as distinct cards. One you get wrong comes back before the session ends without
          making it longer.
        </p>
      </fieldset>
    </div>
  )
}
