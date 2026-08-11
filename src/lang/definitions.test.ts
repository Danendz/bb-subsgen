import { describe, expect, test } from 'vitest'
import { parseDefinitions } from './definitions'

describe('parseDefinitions', () => {
  test('leaves ordinary definitions untouched', () => {
    const result = parseDefinitions(['to like', 'to be fond of'])
    expect(result.definitions).toEqual(['to like', 'to be fond of'])
    expect(result.classifiers).toEqual([])
  })

  test('extracts a standalone CL line, preferring simplified', () => {
    // 朋友 in CC-CEDICT: /friend/CL:個|个[ge4],位[wei4]/
    const result = parseDefinitions(['friend', 'CL:個|个[ge4],位[wei4]'])
    expect(result.definitions).toEqual(['friend'])
    expect(result.classifiers).toEqual([
      { word: '个', pinyin: 'ge4' },
      { word: '位', pinyin: 'wei4' },
    ])
  })

  test('uses the traditional form when asked', () => {
    const result = parseDefinitions(['friend', 'CL:個|个[ge4]'], true)
    expect(result.classifiers).toEqual([{ word: '個', pinyin: 'ge4' }])
  })

  test('handles a classifier with no traditional/simplified split', () => {
    const result = parseDefinitions(['CL:把[ba3]'])
    expect(result.definitions).toEqual([])
    expect(result.classifiers).toEqual([{ word: '把', pinyin: 'ba3' }])
  })

  test('lifts an embedded (CL:...) out of the definition text', () => {
    const result = parseDefinitions(['light; ray (CL:道[dao4])'])
    expect(result.definitions).toEqual(['light; ray'])
    expect(result.classifiers).toEqual([{ word: '道', pinyin: 'dao4' }])
  })

  test('deduplicates classifiers repeated across senses', () => {
    const result = parseDefinitions(['a thing (CL:個|个[ge4])', 'CL:個|个[ge4]'])
    expect(result.definitions).toEqual(['a thing'])
    expect(result.classifiers).toEqual([{ word: '个', pinyin: 'ge4' }])
  })

  test('drops a definition that is empty once its classifier is lifted out', () => {
    const result = parseDefinitions(['(CL:套[tao4])'])
    expect(result.definitions).toEqual([])
    expect(result.classifiers).toEqual([{ word: '套', pinyin: 'tao4' }])
  })
})
