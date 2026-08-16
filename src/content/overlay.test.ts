// @vitest-environment jsdom
import { describe, expect, test } from 'vitest'
import { renderCue, setTranslation, translationWithheld, type CueView } from './overlay'
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
      translationWithheld(
        view({ tokens: [zh('我'), zh('憔悴')], known: new Set(['我']) }),
      ),
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

    renderCue(root, view({ tokens: [zh('我')], translation: '', translationSource: null }), settings)

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
    renderCue(root, view({ tokens: [zh('我')], translation: '', translationSource: null }), settings)

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
