// @vitest-environment jsdom
import { describe, expect, test } from 'vitest'
import { renderCue, setNotice, setTranslation, translationWithheld, type CueView } from './overlay'
import type { Token } from '../lang/segment'
import { DEFAULT_SETTINGS, type Settings } from '../shared/settings'

const zh = (text: string): Token => ({ text, pinyin: 'x1' })
const other = (text: string): Token => ({ text, pinyin: null })

function view(partial: Partial<CueView> & Pick<CueView, 'tokens'>): CueView {
  return {
    translation: 'I am studying Chinese.',
    translationSource: 'nmt',
    known: new Set(),
    quiz: false,
    ...partial,
  }
}

// jsdom implements neither constructable stylesheets nor adoptedStyleSheets, and
// ensureStack adopts on every render. The styles are not what these tests are
// about, so give it just enough of both to get to the DOM.
if (typeof CSSStyleSheet === 'undefined' || !CSSStyleSheet.prototype.replaceSync) {
  class Stub {
    replaceSync(): void {}
  }
  Object.defineProperty(globalThis, 'CSSStyleSheet', { value: Stub, writable: true })
}
if (!('adoptedStyleSheets' in ShadowRoot.prototype)) {
  const sheets = new WeakMap<ShadowRoot, unknown[]>()
  Object.defineProperty(ShadowRoot.prototype, 'adoptedStyleSheets', {
    get(this: ShadowRoot) {
      return sheets.get(this) ?? sheets.set(this, []).get(this)!
    },
    set(this: ShadowRoot, value: unknown[]) {
      sheets.set(this, value)
    },
  })
}

function host(overrides: Partial<Settings> = {}): {
  root: ShadowRoot
  settings: Settings
} {
  const root = document.createElement('div').attachShadow({ mode: 'open' })
  return { root, settings: { ...DEFAULT_SETTINGS, showTranslation: true, ...overrides } }
}

const translationEl = (root: ShadowRoot) => root.querySelector('.translation')!

describe('translationWithheld', () => {
  test('holds it back once every word in the line is known', () => {
    expect(
      translationWithheld(
        view({ tokens: [zh('我'), zh('很'), zh('好')], known: new Set(['我', '很', '好']) }),
      ),
    ).toBe(true)
  })

  test('shows it while any word is still unknown', () => {
    expect(
      translationWithheld(view({ tokens: [zh('我'), zh('憔悴')], known: new Set(['我']) })),
    ).toBe(false)
  })

  test('quiz mode holds it back regardless of what you know', () => {
    expect(translationWithheld(view({ tokens: [zh('憔悴')], quiz: true }))).toBe(true)
  })

  test('ignores punctuation when deciding', () => {
    // Otherwise a trailing 。would count as an unknown word and no line would
    // ever qualify.
    expect(
      translationWithheld(
        view({ tokens: [zh('我'), other('。'), other(' ')], known: new Set(['我']) }),
      ),
    ).toBe(true)
  })

  test('a line with no Chinese in it keeps its translation', () => {
    // An empty or Latin-only cue is not a line you have demonstrably read.
    expect(translationWithheld(view({ tokens: [other('♪')] }))).toBe(false)
    expect(translationWithheld(view({ tokens: [] }))).toBe(false)
  })

  test('an empty known set never withholds', () => {
    // The day-one case: nothing is known, so nothing is held back.
    expect(translationWithheld(view({ tokens: [zh('我'), zh('好')] }))).toBe(false)
  })
})

// The dot itself is a ::after rule, so these assert the class that turns it on
// rather than the pixel. What matters is that the class tracks the tier.
describe('marking the model’s translations', () => {
  test('dots a line the model translated', () => {
    const { root, settings } = host()

    renderCue(root, view({ tokens: [zh('我')], translationSource: 'llm' }), settings)

    expect(translationEl(root).classList.contains('ai')).toBe(true)
  })

  test('leaves the on-device translation unmarked', () => {
    const { root, settings } = host()

    renderCue(root, view({ tokens: [zh('我')], translationSource: 'nmt' }), settings)

    expect(translationEl(root).classList.contains('ai')).toBe(false)
  })

  test('a line with no translation yet is unmarked', () => {
    const { root, settings } = host()

    renderCue(
      root,
      view({ tokens: [zh('我')], translation: '', translationSource: null }),
      settings,
    )

    expect(translationEl(root).classList.contains('ai')).toBe(false)
  })

  test('marks the standalone card the same way', () => {
    const { root, settings } = host({ translationLayout: 'card' })

    renderCue(root, view({ tokens: [zh('我')], translationSource: 'llm' }), settings)

    const el = translationEl(root)
    expect(el.classList.contains('standalone')).toBe(true)
    expect(el.classList.contains('ai')).toBe(true)
  })

  // setTranslation patches the line already on screen rather than re-rendering
  // it, so the mark has to be patched with it — the whole point is a line that
  // arrives as one tier and is filled in by the other.
  test('a late model translation brings its mark with it', () => {
    const { root, settings } = host()
    renderCue(
      root,
      view({ tokens: [zh('我')], translation: '', translationSource: null }),
      settings,
    )

    setTranslation(root, 'The better one.', 'llm')

    expect(translationEl(root).textContent).toBe('The better one.')
    expect(translationEl(root).classList.contains('ai')).toBe(true)
  })

  test('and a late on-device one clears any mark that was there', () => {
    const { root, settings } = host()
    renderCue(root, view({ tokens: [zh('我')], translationSource: 'llm' }), settings)

    setTranslation(root, 'The quick one.', 'nmt')

    expect(translationEl(root).classList.contains('ai')).toBe(false)
  })

  // Withholding hides the text; the mark is part of the text's presentation and
  // must not be a side channel that survives it.
  test('a withheld line keeps the mark inside what is hidden', () => {
    const { root, settings } = host()

    renderCue(
      root,
      view({ tokens: [zh('我')], known: new Set(['我']), translationSource: 'llm' }),
      settings,
    )

    const el = translationEl(root)
    expect(el.classList.contains('withheld')).toBe(true)
    expect(el.classList.contains('ai')).toBe(true)
  })
})

describe('the transcription notice', () => {
  const noticeEl = (root: ShadowRoot) => root.querySelector<HTMLElement>('.notice')!
  const showing = (root: ShadowRoot) => !noticeEl(root).classList.contains('hidden')

  const view = (over: Partial<Parameters<typeof setNotice>[1]> = {}) => ({
    text: '5 minutes could not be transcribed.',
    action: 'Retry',
    onAction: () => {},
    onDismiss: () => {},
    ...over,
  })

  test('says what happened, and hides again for null', () => {
    const { root } = host()

    setNotice(root, view())
    expect(showing(root)).toBe(true)
    expect(root.querySelector('.notice-text')!.textContent).toBe(
      '5 minutes could not be transcribed.',
    )

    setNotice(root, null)
    expect(showing(root)).toBe(false)
  })

  test('sits below the line, not above it', () => {
    // The progress pill goes above the card because it is about what is coming.
    // This is about something that has already stopped, and must not push the
    // sentence being read around.
    const { root } = host()
    setNotice(root, view())

    const classes = [...root.querySelector('.stack')!.children].map((el) => el.className)
    expect(classes.indexOf('line')).toBeLessThan(classes.indexOf('notice'))
    expect(classes.indexOf('progress hidden')).toBeLessThan(classes.indexOf('line'))
  })

  test('retries and dismisses', () => {
    const { root } = host()
    let retried = 0
    let dismissed = 0
    setNotice(root, view({ onAction: () => retried++, onDismiss: () => dismissed++ }))

    root.querySelector<HTMLButtonElement>('.notice-retry')!.click()
    root.querySelector<HTMLButtonElement>('.notice-close')!.click()

    expect([retried, dismissed]).toEqual([1, 1])
  })

  test('does not stack a handler per repaint', () => {
    // It is re-rendered on every settings change and every remount, so
    // addEventListener here would fire one retry per repaint since the failure.
    const { root } = host()
    let retried = 0
    const again = view({ onAction: () => retried++ })
    setNotice(root, again)
    setNotice(root, again)
    setNotice(root, again)

    root.querySelector<HTMLButtonElement>('.notice-retry')!.click()

    expect(retried).toBe(1)
  })
})

describe('the notice button label', () => {
  test('says whatever the caller asked it to', () => {
    // One widget, two jobs: reporting a stopped run, and asking whether a video
    // is worth transcribing. A hardcoded `Retry` could only ever do the first.
    const root = document.createElement('div').attachShadow({ mode: 'open' })
    setNotice(root, {
      text: 'This does not look like a Chinese video.',
      action: 'Transcribe',
      onAction: () => {},
      onDismiss: () => {},
    })
    expect(root.querySelector('.notice-retry')!.textContent).toBe('Transcribe')

    setNotice(root, {
      text: 'Could not reach the speech server.',
      action: 'Retry',
      onAction: () => {},
      onDismiss: () => {},
    })
    expect(root.querySelector('.notice-retry')!.textContent).toBe('Retry')
  })
})
