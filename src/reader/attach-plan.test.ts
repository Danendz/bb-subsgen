import { describe, expect, test } from 'vitest'
import { planAttach, type AttachSituation } from './attach-plan'

/** A page the reader is switched on for, with a pack, and nothing attached yet. */
const situation = (overrides: Partial<AttachSituation> = {}): AttachSituation => ({
  enabled: true,
  resolvedLang: 'zh',
  activeLang: null,
  attached: false,
  hasPack: true,
  ...overrides,
})

/** The same page with a reader already running in `lang`. */
const running = (lang: string, overrides: Partial<AttachSituation> = {}): AttachSituation =>
  situation({ activeLang: lang, resolvedLang: lang, attached: true, ...overrides })

describe('whether the reader attaches at all', () => {
  test('starts on a page it is switched on for', () => {
    expect(planAttach(situation()).action).toBe('start')
  })

  test('does nothing on a page it is switched off for, rather than tearing down nothing', () => {
    expect(planAttach(situation({ enabled: false })).action).toBe('nothing')
  })

  test('stops when the site is switched off under a running reader', () => {
    expect(planAttach(running('zh', { enabled: false })).action).toBe('stop')
  })

  test('never attaches in a language with no pack', () => {
    // No pack means no segmenter and no script test, which is every question
    // the reader would ask — attaching would annotate nothing, anywhere.
    const plan = planAttach(situation({ resolvedLang: 'ko', hasPack: false }))
    expect(plan.action).toBe('nothing')
    expect(plan.verdict).toBe('no language pack for ko')
  })
})

describe('when the language changes under a running reader', () => {
  test('rebuilds, because the segmenter and the definitions have to move together', () => {
    // #17 made this reachable: with one pack installed nothing could change.
    expect(planAttach(running('zh', { resolvedLang: 'ja' })).action).toBe('restart')
  })

  test('leaves a reader already in that language alone', () => {
    // `apply()` runs on every settings echo, and a rebuild per echo would drop
    // the word list and the session override on each one.
    expect(planAttach(running('ja')).action).toBe('nothing')
  })

  test('takes the reader down when the new language has no pack', () => {
    // Rather than leaving it running on the old one, which would silently
    // ignore the switch the user just made.
    expect(planAttach(running('zh', { resolvedLang: 'ko', hasPack: false })).action).toBe('stop')
  })

  test('being switched off outranks a language change', () => {
    expect(planAttach(running('zh', { resolvedLang: 'ja', enabled: false })).action).toBe('stop')
  })
})

describe('the verdict', () => {
  test('names the language a page is being read in', () => {
    expect(planAttach(situation({ resolvedLang: 'ja' })).verdict).toBe('reading this page in ja')
  })

  test('distinguishes a reread from a first attach, since both end in attachReader', () => {
    expect(planAttach(running('zh', { resolvedLang: 'ja' })).verdict).toBe(
      'rereading this page in ja',
    )
  })

  test('says why a page was left alone', () => {
    expect(planAttach(situation({ enabled: false })).verdict).toBe('reader is off for this site')
    expect(planAttach(running('zh')).verdict).toBe('already reading this page in zh')
  })
})
