import { describe, expect, test } from 'vitest'
import { explainUrl } from './explain-drawer'

const BASE = 'chrome-extension://abc/src/app/index.html'

function paramsOf(url: string): URLSearchParams {
  return new URL(url).searchParams
}

describe('explainUrl', () => {
  test('marks the page as framed and carries the line', () => {
    const params = paramsOf(explainUrl({ line: '我吃了饭' }, BASE))

    expect(params.get('embed')).toBe('1')
    expect(params.get('line')).toBe('我吃了饭')
  })

  // Before the hash, so the app's hash router still sees a plain route and
  // URLSearchParams can read them without anything parsing a hash by hand.
  test('puts the parameters in the search and the route in the hash', () => {
    const url = new URL(explainUrl({ line: '你好' }, BASE))

    expect(url.hash).toBe('#/explain')
    expect(url.search.startsWith('?embed=1')).toBe(true)
  })

  test('carries everything the passage is rebuilt from', () => {
    const params = paramsOf(
      explainUrl({ line: '我吃了饭', word: '了', videoId: 'BV1xx', start: 12.5, title: '播客' }, BASE),
    )

    expect(params.get('word')).toBe('了')
    expect(params.get('videoId')).toBe('BV1xx')
    expect(params.get('start')).toBe('12.5')
    expect(params.get('title')).toBe('播客')
  })

  // A cue at 0s is a real timestamp, and `if (start)` would drop it.
  test('keeps a start of zero', () => {
    expect(paramsOf(explainUrl({ line: '你好', start: 0 }, BASE)).get('start')).toBe('0')
  })

  test('leaves out what it does not have', () => {
    const params = paramsOf(explainUrl({ line: '你好' }, BASE))

    expect(params.has('word')).toBe(false)
    expect(params.has('videoId')).toBe(false)
    expect(params.has('start')).toBe(false)
  })

  test('escapes a line that would otherwise break the query', () => {
    const line = 'a&b=c?d#e'
    const url = explainUrl({ line }, BASE)

    expect(url).not.toContain('a&b=c')
    expect(paramsOf(url).get('line')).toBe(line)
  })
})
