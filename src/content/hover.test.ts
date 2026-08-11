import { describe, expect, test } from 'vitest'
import { HoverPauseController } from './hover'

describe('HoverPauseController', () => {
  test('pauses on hover start when the video was playing', () => {
    const controller = new HoverPauseController()
    expect(controller.onHoverStart(/* paused */ false)).toBe(true) // shouldPause
  })

  test('resumes on hover end if it initiated the pause', () => {
    const controller = new HoverPauseController()
    controller.onHoverStart(false)
    expect(controller.onHoverEnd()).toBe(true) // shouldResume
  })

  test('does not touch playback if the video was already paused', () => {
    const controller = new HoverPauseController()
    expect(controller.onHoverStart(/* paused */ true)).toBe(false) // shouldPause
    expect(controller.onHoverEnd()).toBe(false) // shouldResume
  })

  test('never resumes a pause the user initiated manually mid-hover', () => {
    const controller = new HoverPauseController()
    controller.onHoverStart(false) // we pause it
    controller.userPaused() // user hits space while hovering
    expect(controller.onHoverEnd()).toBe(false) // shouldResume — must not override
  })

  test('resets state between independent hover sessions', () => {
    const controller = new HoverPauseController()
    controller.onHoverStart(false)
    controller.onHoverEnd()
    expect(controller.onHoverStart(true)).toBe(false)
    expect(controller.onHoverEnd()).toBe(false)
  })

  test('keeps pause ownership when moving between words without resuming', () => {
    const controller = new HoverPauseController()
    controller.onHoverStart(/* paused */ false) // we pause it

    // Hovering the next word sees an already-paused video — but it's *our*
    // pause, so we must not hand ownership away or re-pause.
    expect(controller.onHoverStart(/* paused */ true)).toBe(false) // shouldPause
    expect(controller.onHoverEnd()).toBe(true) // still ours to resume
  })

  test('does not reclaim a pause the user took over mid-hover', () => {
    const controller = new HoverPauseController()
    controller.onHoverStart(false)
    controller.userPaused()

    expect(controller.onHoverStart(true)).toBe(false)
    expect(controller.onHoverEnd()).toBe(false)
  })
})
