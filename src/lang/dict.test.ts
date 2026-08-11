import { describe, expect, test } from 'vitest'
import { parseWords, openDefsDb, importDefs, lookupDefsIn, type CedictEntry } from './dict'

describe('parseWords', () => {
  test('parses tab-separated headword/pinyin lines into a Map', () => {
    const words = parseWords('我\two3\n喜欢\txi3 huan5')
    expect(words.get('我')).toBe('wo3')
    expect(words.get('喜欢')).toBe('xi3 huan5')
    expect(words.size).toBe(2)
  })

  test('ignores blank lines', () => {
    const words = parseWords('我\two3\n\n喜欢\txi3 huan5\n')
    expect(words.size).toBe(2)
  })
})

describe('defs IndexedDB store', () => {
  const entry: CedictEntry = {
    simplified: '喜欢',
    traditional: '喜歡',
    pinyin: 'xi3 huan5',
    definitions: ['to like', 'to be fond of'],
  }

  test('imports definitions and looks them up by headword', async () => {
    const db = await openDefsDb(`test-${Math.random()}`)
    await importDefs(db, { 喜欢: [entry] })

    expect(await lookupDefsIn(db, '喜欢')).toEqual([entry])
  })

  test('returns an empty array for an unknown headword', async () => {
    const db = await openDefsDb(`test-${Math.random()}`)
    await importDefs(db, { 喜欢: [entry] })

    expect(await lookupDefsIn(db, '不存在')).toEqual([])
  })
})
