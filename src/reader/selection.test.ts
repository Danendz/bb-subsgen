import { describe, expect, test } from 'vitest'
import { ClickGuard, containsHan } from './selection'

describe('containsHan', () => {
  test('detects Han characters anywhere in the string', () => {
    expect(containsHan('hello 学习')).toBe(true)
    expect(containsHan('学')).toBe(true)
  })

  test('rejects text with no Han characters', () => {
    expect(containsHan('hello world')).toBe(false)
    expect(containsHan('')).toBe(false)
    expect(containsHan('。！？')).toBe(false) // punctuation alone is not text to look up
  })
})

describe('ClickGuard', () => {
  const drag = (guard: ClickGuard, text: string) => {
    guard.pointerDown(10, 10)
    return guard.pointerUp(80, 10, text)
  }

  test('opens a card and arms suppression after dragging over Han text', () => {
    const guard = new ClickGuard()
    expect(drag(guard, '学习中文')).toBe(true)
    expect(guard.shouldSuppressClick()).toBe(true)
  })

  test('ignores a click that never moved', () => {
    const guard = new ClickGuard()
    guard.pointerDown(10, 10)
    expect(guard.pointerUp(12, 11, '学习')).toBe(false)
    expect(guard.shouldSuppressClick()).toBe(false)
  })

  test('ignores a drag that selected no Chinese', () => {
    const guard = new ClickGuard()
    expect(drag(guard, 'hello world')).toBe(false)
    expect(guard.shouldSuppressClick()).toBe(false)
  })

  test('ignores a drag that selected nothing', () => {
    const guard = new ClickGuard()
    expect(drag(guard, '')).toBe(false)
  })

  test('suppresses only one click', () => {
    // The guard must never leak into the next click, or every second click on
    // the page would silently do nothing.
    const guard = new ClickGuard()
    drag(guard, '学习')
    expect(guard.shouldSuppressClick()).toBe(true)
    expect(guard.shouldSuppressClick()).toBe(false)
  })

  test('a new press clears a suppression that was never consumed', () => {
    // A drag can end without producing a click at all — releasing outside the
    // element it started in. That stale arming must not eat a later click.
    const guard = new ClickGuard()
    drag(guard, '学习')
    guard.pointerDown(200, 200)
    expect(guard.shouldSuppressClick()).toBe(false)
  })

  test('ignores a mouseup with no matching press', () => {
    // Selecting with the keyboard, or a press that began before the reader
    // was enabled.
    const guard = new ClickGuard()
    expect(guard.pointerUp(80, 10, '学习')).toBe(false)
  })

  test('disarm drops a pending suppression', () => {
    const guard = new ClickGuard()
    drag(guard, '学习')
    guard.disarm()
    expect(guard.shouldSuppressClick()).toBe(false)
  })

  test('counts vertical drags too', () => {
    const guard = new ClickGuard()
    guard.pointerDown(10, 10)
    expect(guard.pointerUp(11, 60, '学习')).toBe(true)
  })
})
