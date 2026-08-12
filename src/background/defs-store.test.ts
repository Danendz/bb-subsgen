import { describe, expect, test } from 'vitest'
import { openDefsDb, importDefs, lookupDefsIn } from './defs-store'
import type { CedictEntry } from '../lang/dict'

const entry: CedictEntry = {
  simplified: '喜欢',
  traditional: '喜歡',
  pinyin: 'xi3 huan5',
  definitions: ['to like', 'to be fond of'],
}

const char: CedictEntry = {
  simplified: '喜',
  traditional: '喜',
  pinyin: 'xi3',
  definitions: ['to be fond of'],
}

async function seeded() {
  const db = await openDefsDb(`test-${Math.random()}`)
  await importDefs(db, { 喜欢: [entry], 喜: [char] })
  return db
}

describe('defs IndexedDB store', () => {
  test('imports definitions and looks them up by headword', async () => {
    expect(await lookupDefsIn(await seeded(), ['喜欢'])).toEqual({ 喜欢: [entry] })
  })

  test('resolves a whole batch in one transaction', async () => {
    expect(await lookupDefsIn(await seeded(), ['喜欢', '喜'])).toEqual({
      喜欢: [entry],
      喜: [char],
    })
  })

  test('reports an unknown headword as empty rather than omitting it', async () => {
    // Callers render "no definition found" from this, so the key has to exist.
    expect(await lookupDefsIn(await seeded(), ['不存在'])).toEqual({ 不存在: [] })
  })

  test('deduplicates repeated headwords', async () => {
    // 一一 breaks down into the same character twice.
    expect(await lookupDefsIn(await seeded(), ['喜', '喜'])).toEqual({ 喜: [char] })
  })

  test('resolves empty for an empty batch without opening a transaction', async () => {
    expect(await lookupDefsIn(await seeded(), [])).toEqual({})
  })
})
