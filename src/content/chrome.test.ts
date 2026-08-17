// @vitest-environment jsdom
import { describe, expect, test } from 'vitest'
import { BILIBILI_CHROME, shouldLift, YOUTUBE_CHROME, youtubeControlsShowing } from './chrome'

describe('shouldLift', () => {
  test('lifts while Bilibili reports its controls as showing', () => {
    expect(shouldLift('false')).toBe(true)
  })

  test('rests while the controls are hidden', () => {
    expect(shouldLift('true')).toBe(false)
  })

  test('rests when the attribute is missing entirely', () => {
    // A player rewrite that drops data-ctrl-hidden must degrade to today's
    // behavior, not to a card permanently floating mid-screen.
    expect(shouldLift(undefined)).toBe(false)
  })
})

describe('youtubeControlsShowing', () => {
  test('rests while YouTube reports its controls as hidden', () => {
    // Measured on a live watch page: the class is added when the bar goes away.
    expect(youtubeControlsShowing('html5-video-player ytp-autohide paused-mode')).toBe(false)
  })

  test('lifts while the bar is up', () => {
    expect(youtubeControlsShowing('html5-video-player playing-mode')).toBe(true)
  })

  test('is not fooled by a class that merely starts the same way', () => {
    // `ytp-autohide-active` and `ytp-autohide` are different states, and a
    // substring test would read the first as the second.
    expect(youtubeControlsShowing('html5-video-player ytp-autohide-active')).toBe(true)
  })
})

describe('the descriptors', () => {
  test('read the control state each site actually publishes', () => {
    const bilibili = document.createElement('div')
    bilibili.dataset.ctrlHidden = 'false'
    expect(BILIBILI_CHROME.controlsShowing(bilibili)).toBe(true)
    bilibili.dataset.ctrlHidden = 'true'
    expect(BILIBILI_CHROME.controlsShowing(bilibili)).toBe(false)

    const youtube = document.createElement('div')
    youtube.className = 'html5-video-player'
    expect(YOUTUBE_CHROME.controlsShowing(youtube)).toBe(true)
    youtube.className = 'html5-video-player ytp-autohide'
    expect(YOUTUBE_CHROME.controlsShowing(youtube)).toBe(false)
  })

  test('watch the attributes their control state is carried on', () => {
    // The MutationObserver filter is only as good as this: a site whose signal
    // moves to an attribute not listed here stops re-measuring silently.
    expect(BILIBILI_CHROME.geometryAttributes).toContain('data-ctrl-hidden')
    expect(YOUTUBE_CHROME.geometryAttributes).toContain('class')
  })
})
