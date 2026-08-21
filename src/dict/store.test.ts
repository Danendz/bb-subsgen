import { describe, expect, test } from 'vitest'
import {
  clearLangIn,
  getLexiconIn,
  getMetaIn,
  lookupDefsIn,
  openDictDb,
  putDefsChunk,
  putLexicon,
  putMeta,
} from './store'
import type { CedictEntry } from './cedict'

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
  const db = await openDictDb(`test-${Math.random()}`)
  await putDefsChunk(
    db,
    'zh',
    new Map([
      ['喜欢', [entry]],
      ['喜', [char]],
    ]),
  )
  return db
}

describe('dict definitions store', () => {
  test('imports definitions and looks them up by headword', async () => {
    expect(await lookupDefsIn(await seeded(), 'zh', ['喜欢'])).toEqual({ 喜欢: [entry] })
  })

  test('resolves a whole batch in one transaction', async () => {
    expect(await lookupDefsIn(await seeded(), 'zh', ['喜欢', '喜'])).toEqual({
      喜欢: [entry],
      喜: [char],
    })
  })

  test('reports an unknown headword as empty rather than omitting it', async () => {
    // Callers render "no definition found" from this, so the key has to exist.
    expect(await lookupDefsIn(await seeded(), 'zh', ['不存在'])).toEqual({ 不存在: [] })
  })

  test('deduplicates repeated headwords', async () => {
    // 一一 breaks down into the same character twice.
    expect(await lookupDefsIn(await seeded(), 'zh', ['喜', '喜'])).toEqual({ 喜: [char] })
  })

  test('resolves empty for an empty batch without opening a transaction', async () => {
    expect(await lookupDefsIn(await seeded(), 'zh', [])).toEqual({})
  })

  test('keeps two languages apart under the same headword', async () => {
    const db = await seeded()
    await putDefsChunk(db, 'ja', new Map([['喜', [{ ...char, pinyin: 'よろこ.ぶ' }]]]))
    expect(await lookupDefsIn(db, 'zh', ['喜'])).toEqual({ 喜: [char] })
    expect(await lookupDefsIn(db, 'ja', ['喜'])).toEqual({ 喜: [{ ...char, pinyin: 'よろこ.ぶ' }] })
  })

  test('clearLangIn removes only the language cleared', async () => {
    const db = await seeded()
    await putDefsChunk(db, 'ja', new Map([['喜', [char]]]))
    await clearLangIn(db, 'zh')
    expect(await lookupDefsIn(db, 'zh', ['喜欢', '喜'])).toEqual({ 喜欢: [], 喜: [] })
    expect(await lookupDefsIn(db, 'ja', ['喜'])).toEqual({ 喜: [char] })
  })

  test('lexicon text and meta round-trip per language', async () => {
    const db = await openDictDb(`test-${Math.random()}`)
    expect(await getLexiconIn(db, 'zh')).toBeNull()
    expect(await getMetaIn(db, 'zh')).toBeNull()

    await putLexicon(db, 'zh', '喜欢\txi3 huan5')
    const meta = { url: 'u', lastModified: null, installedAt: 1, entryCount: 1, formatVersion: 2 }
    await putMeta(db, 'zh', meta)

    expect(await getLexiconIn(db, 'zh')).toBe('喜欢\txi3 huan5')
    expect(await getMetaIn(db, 'zh')).toEqual(meta)
  })
})
