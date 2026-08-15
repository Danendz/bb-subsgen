import { describe, expect, test } from 'vitest'
import { parseSseChunk, SSE_DONE } from './sse'

describe('parseSseChunk', () => {
  test('reads a complete event', () => {
    expect(parseSseChunk('data: {"a":1}\n\n')).toEqual({ data: ['{"a":1}'], rest: '' })
  })

  test('holds back an event that has not been terminated yet', () => {
    expect(parseSseChunk('data: {"a":1}')).toEqual({ data: [], rest: 'data: {"a":1}' })
  })

  test('rejoins a payload split across two chunks', () => {
    const first = parseSseChunk('data: {"content":"ni')
    expect(first.data).toEqual([])

    const second = parseSseChunk(`${first.rest}hao"}\n\n`)
    expect(second.data).toEqual(['{"content":"nihao"}'])
  })

  test('reads several events from one chunk', () => {
    const { data } = parseSseChunk('data: one\n\ndata: two\n\ndata: three\n\n')
    expect(data).toEqual(['one', 'two', 'three'])
  })

  test('handles CRLF line endings', () => {
    expect(parseSseChunk('data: {"a":1}\r\n\r\n').data).toEqual(['{"a":1}'])
  })

  // A CRLF landing on a chunk boundary is the case that silently eats events if
  // the trailing CR is normalized to a newline before its LF has arrived.
  test('does not split an event on a CR that ends a chunk', () => {
    const first = parseSseChunk('data: one\r\n\r')
    expect(first.data).toEqual([])

    const second = parseSseChunk(`${first.rest}\ndata: two\r\n\r\n`)
    expect(second.data).toEqual(['one', 'two'])
  })

  test('ignores comment lines and keep-alives', () => {
    const { data } = parseSseChunk(': keep-alive\n\ndata: real\n\n')
    expect(data).toEqual(['real'])
  })

  test('joins multiple data lines within one event', () => {
    expect(parseSseChunk('data: first\ndata: second\n\n').data).toEqual(['first\nsecond'])
  })

  test('strips only the single optional space after the colon', () => {
    expect(parseSseChunk('data:  padded\n\n').data).toEqual([' padded'])
  })

  test('passes the done sentinel through rather than swallowing it', () => {
    expect(parseSseChunk(`data: ${SSE_DONE}\n\n`).data).toEqual([SSE_DONE])
  })

  test('an empty buffer produces nothing', () => {
    expect(parseSseChunk('')).toEqual({ data: [], rest: '' })
  })
})
