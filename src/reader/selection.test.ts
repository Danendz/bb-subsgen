import { describe, expect, test } from 'vitest'
import { ClickGuard } from './selection'
import { chinesePack } from '../lang/zh/pack'

describe('ClickGuard', () => {
  /** A press that travels, leaving `text` selected. `was` is the selection it began with. */
  const drag = (guard: ClickGuard, text: string, was = '') => {
    guard.pointerDown(10, 10, was)
    return guard.pointerUp(80, 10, text)
  }

  /** A press that never moves, as a double- or triple-click doesn't. */
  const tap = (guard: ClickGuard, text: string, was = '') => {
    guard.pointerDown(10, 10, was)
    return guard.pointerUp(12, 11, text)
  }

  test('opens a card and arms suppression after dragging over Han text', () => {
    const guard = new ClickGuard(chinesePack)
    expect(drag(guard, '学习中文')).toBe(true)
    expect(guard.shouldSuppressClick()).toBe(true)
  })

  test('opens a card for a double-click, which selects without moving', () => {
    // The reported bug: double-clicking a sentence selected it and produced
    // nothing, because travel was the only thing that counted as intent.
    const guard = new ClickGuard(chinesePack)
    expect(tap(guard, '学习中文')).toBe(true)
    expect(guard.shouldSuppressClick()).toBe(true)
  })

  test('ignores a click that changes nothing', () => {
    // Clicking a `user-select: none` control does not collapse the selection
    // the way clicking text does, so Han text is still selected at mouseup.
    // Arming here would suppress the click and leave the button dead.
    const guard = new ClickGuard(chinesePack)
    expect(tap(guard, '学习中文', '学习中文')).toBe(false)
    expect(guard.shouldSuppressClick()).toBe(false)
  })

  test('opens a card when a click replaces one selection with another', () => {
    const guard = new ClickGuard(chinesePack)
    expect(tap(guard, '中文', '学习')).toBe(true)
  })

  test('re-dragging the same text still opens a card', () => {
    // Movement is what carries this one: the selection is identical, so the
    // changed-selection test alone would refuse it.
    const guard = new ClickGuard(chinesePack)
    expect(drag(guard, '学习中文', '学习中文')).toBe(true)
  })

  test('ignores a drag that selected no Chinese', () => {
    const guard = new ClickGuard(chinesePack)
    expect(drag(guard, 'hello world')).toBe(false)
    expect(guard.shouldSuppressClick()).toBe(false)
  })

  test('ignores a drag that selected nothing', () => {
    const guard = new ClickGuard(chinesePack)
    expect(drag(guard, '')).toBe(false)
  })

  test('ignores a click that only clears a selection', () => {
    // Clicking plain text collapses what was selected. That is a change, but
    // there is nothing left to look up.
    const guard = new ClickGuard(chinesePack)
    expect(tap(guard, '', '学习中文')).toBe(false)
  })

  test('suppresses only one click', () => {
    // The guard must never leak into the next click, or every second click on
    // the page would silently do nothing.
    const guard = new ClickGuard(chinesePack)
    drag(guard, '学习')
    expect(guard.shouldSuppressClick()).toBe(true)
    expect(guard.shouldSuppressClick()).toBe(false)
  })

  test('a new press clears a suppression that was never consumed', () => {
    // A drag can end without producing a click at all — releasing outside the
    // element it started in. That stale arming must not eat a later click.
    const guard = new ClickGuard(chinesePack)
    drag(guard, '学习')
    guard.pointerDown(200, 200, '学习')
    expect(guard.shouldSuppressClick()).toBe(false)
  })

  test('ignores a mouseup with no matching press', () => {
    // Selecting with the keyboard, or a press that began before the reader
    // was enabled.
    const guard = new ClickGuard(chinesePack)
    expect(guard.pointerUp(80, 10, '学习')).toBe(false)
  })

  test('disarm drops a pending suppression', () => {
    const guard = new ClickGuard(chinesePack)
    drag(guard, '学习')
    guard.disarm()
    expect(guard.shouldSuppressClick()).toBe(false)
  })

  test('counts vertical drags too', () => {
    const guard = new ClickGuard(chinesePack)
    guard.pointerDown(10, 10, '')
    expect(guard.pointerUp(11, 60, '学习')).toBe(true)
  })
})
