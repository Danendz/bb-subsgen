import { describe, expect, test } from 'vitest'
import { settingsEffect } from './settings-effect'
import { DEFAULT_SETTINGS, type Settings } from '../shared/settings'

const on: Settings = {
  ...DEFAULT_SETTINGS,
  enabled: true,
  showTranslation: true,
  translationLang: 'en',
  llmEnabled: true,
  llmTranslationEnabled: true,
  llmBaseUrl: 'http://localhost:1234/v1',
  llmTranslationModel: 'qwen',
}
const change = (over: Partial<Settings>) => settingsEffect(on, { ...on, ...over })

describe('settingsEffect', () => {
  test('leaves the passes alone for a change that only affects what is drawn', () => {
    expect(change({ showToneColors: !on.showToneColors })).toBe('repaint')
    expect(change({})).toBe('repaint')
  })

  test('reloads the video when the extension is switched off, rather than repainting', () => {
    expect(change({ enabled: false })).toBe('reload')
    expect(settingsEffect({ ...on, enabled: false }, on)).toBe('reload')
  })

  test('restarts both passes for a new target language, since neither has its lines', () => {
    expect(change({ translationLang: 'ru' })).toBe('restart-passes')
  })

  test('starts and stops both passes with the translation toggle', () => {
    expect(change({ showTranslation: false })).toBe('stop-passes')
    expect(settingsEffect({ ...on, showTranslation: false }, on)).toBe('start-passes')
  })

  /**
   * The post-mortem this branch exists for. `llmBaseUrl` was not in the change
   * test, so fixing a typo in the server address did nothing until the page was
   * reloaded — the pass went on pointing at the address that never answered.
   */
  test('correcting a typo in the model server restarts the pass without a reload', () => {
    expect(change({ llmBaseUrl: 'http://localhost:1235/v1' })).toBe('start-llm')
  })

  test('a different model is a different translator, so the pass restarts', () => {
    expect(change({ llmTranslationModel: 'gemma' })).toBe('start-llm')
  })

  test('stops the model pass when either switch behind it goes off', () => {
    expect(change({ llmEnabled: false })).toBe('stop-llm')
    expect(change({ llmTranslationEnabled: false })).toBe('stop-llm')
  })

  /**
   * Precedence, which was previously only the order the branches were written
   * in. Each of these changes two things at once and must do the larger of them.
   */
  test('a change of language outranks the toggle it arrives with', () => {
    expect(change({ translationLang: 'ru', showTranslation: false })).toBe('restart-passes')
  })

  test('the toggle outranks a model change, since no pass runs with it off', () => {
    expect(change({ showTranslation: false, llmBaseUrl: 'http://elsewhere/v1' })).toBe(
      'stop-passes',
    )
  })

  test('switching the extension off outranks everything arriving with it', () => {
    expect(change({ enabled: false, translationLang: 'ru', llmEnabled: false })).toBe('reload')
  })

  /**
   * Deliberately not this function's question. Whether the server and the model
   * are actually filled in is the pass's own guard, and answering it here would
   * mean two places had to agree on what "usable" means.
   */
  test('reports a start even where the model pass will refuse it for want of a URL', () => {
    const off = { ...on, llmEnabled: false }
    expect(settingsEffect(off, { ...off, llmEnabled: true, llmBaseUrl: '' })).toBe('start-llm')
  })
})
