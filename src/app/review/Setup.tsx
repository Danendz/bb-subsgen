// Choosing how a session works, before it starts.
//
// Saved rather than asked each time: this is a daily habit, and a habit that
// makes you restate your preferences every morning is one you stop having. The
// summary stays on screen when the panel is closed, so what you are about to
// study is never hidden behind a menu.

import type { StudyInclude, StudyMode } from '../../flashcards/types'
import { MAX_SESSION_SIZE, MIN_SESSION_SIZE } from '../../shared/settings'

export interface SessionSetup {
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
  { value: 'both', label: 'Words and lines' },
  { value: 'words', label: 'Words only' },
  { value: 'sentences', label: 'Lines only' },
]

const MODE_LABEL: Record<StudyMode, string> = {
  mixed: 'Mixed',
  remember: 'Remembering',
  type: 'Typing',
  audio: 'Listening',
}

const INCLUDE_LABEL: Record<StudyInclude, string> = {
  both: 'words + lines',
  words: 'words only',
  sentences: 'lines only',
}

export function setupSummary(setup: SessionSetup): string {
  return `${MODE_LABEL[setup.studyMode]} · ${INCLUDE_LABEL[setup.studyInclude]} · ${setup.studySessionSize} cards`
}

export interface SetupProps {
  setup: SessionSetup
  /** False when the machine has no Mandarin voice, which rules listening out. */
  canSpeak: boolean
  onChange: (patch: Partial<SessionSetup>) => void
}

export function Setup({ setup, canSpeak, onChange }: SetupProps) {
  return (
    <div class="setup">
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
