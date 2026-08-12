// @vitest-environment jsdom
import { beforeEach, describe, expect, test } from 'vitest'
import { createPageMode } from './page-mode'

const STYLE_ID = 'bb-subsgen-reader-mode-style'
const ACTIVE = 'data-bb-subsgen-reader'

const styles = () => document.querySelectorAll(`#${STYLE_ID}`)
const active = () => document.documentElement.hasAttribute(ACTIVE)

beforeEach(() => {
  document.head.innerHTML = ''
  document.documentElement.removeAttribute(ACTIVE)
})

describe('createPageMode', () => {
  test('installs the stylesheet inert', () => {
    createPageMode()
    expect(styles()).toHaveLength(1)
    // Constructing it must not restyle anything — the reader is attached on
    // every enabled page, and the override belongs only to a held modifier.
    expect(active()).toBe(false)
  })

  test('toggles only the attribute', () => {
    const mode = createPageMode()

    mode.activate()
    expect(active()).toBe(true)
    expect(styles()).toHaveLength(1)

    mode.deactivate()
    expect(active()).toBe(false)
    // The sheet stays put: toggling is one attribute flip rather than
    // re-parsing CSS on every keypress.
    expect(styles()).toHaveLength(1)
  })

  test('survives repeated activation without stacking anything', () => {
    const mode = createPageMode()
    mode.activate()
    mode.activate()
    mode.deactivate()
    mode.deactivate()
    expect(active()).toBe(false)
    expect(styles()).toHaveLength(1)
  })

  test('never installs a second sheet', () => {
    // The reader guards against two instances per page, but a stale sheet left
    // by a previous attach must not be duplicated either.
    createPageMode()
    createPageMode()
    expect(styles()).toHaveLength(1)
  })

  test('leaves no trace once destroyed', () => {
    // Switching the reader off for an origin has to hand the page back exactly
    // as it was found — a page stuck force-selectable with dead links would be
    // worse than the bug this fixes.
    const mode = createPageMode()
    mode.activate()
    mode.destroy()
    expect(active()).toBe(false)
    expect(styles()).toHaveLength(0)
  })

  test('scopes every rule to the active attribute', () => {
    // If any selector escaped the attribute gate it would restyle the page for
    // the whole visit, not just while the key is down.
    createPageMode()
    const css = document.getElementById(STYLE_ID)?.textContent ?? ''
    const selectors = css
      .split('}')
      .map((block) => block.split('{')[0].trim())
      .filter(Boolean)

    expect(selectors.length).toBeGreaterThan(0)
    for (const selector of selectors) {
      for (const part of selector.split(',')) {
        expect(part.trim()).toMatch(new RegExp(`^html\\[${ACTIVE}\\]`))
      }
    }
  })

  test('hands our own shadow hosts their cursor back', () => {
    // A page-level `*` rule matches the hosts, which sit in the light DOM, and
    // `cursor` and `user-select` would inherit through `:host { all: initial }`
    // into the cards. An id selector outranks `*` with both important.
    createPageMode()
    const css = document.getElementById(STYLE_ID)?.textContent ?? ''
    expect(css).toContain('#bb-subsgen-reader-host')
    expect(css).toContain('#bb-subsgen-host')
    expect(css).toContain('cursor: auto !important')
  })
})
