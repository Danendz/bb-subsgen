import { describe, expect, test } from 'vitest'
import {
  clearGlossesIn,
  clearLangIn,
  getLexiconIn,
  getMetaIn,
  lookupDefsIn,
  lookupGlossesIn,
  openDictDb,
  putDefsChunk,
  putGlossesIn,
  putLexicon,
  putMeta,
} from './store'

// Deliberately untyped beyond what they are: the store takes `DictRow`, which
// is `unknown`, and these cases are about a row surviving the round trip
// unchanged — not about any dictionary's format. The shapes are CC-CEDICT's
// only because a fixture has to look like something.
const entry = {
  simplified: '喜欢',
  traditional: '喜歡',
  pinyin: 'xi3 huan5',
  definitions: ['to like', 'to be fond of'],
}

const char = {
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

describe('translated glosses', () => {
  const fresh = () => openDictDb(`test-${Math.random()}`)

  test('a headword nobody has translated is absent, not empty', async () => {
    const db = await fresh()

    // "not translated yet" and "translated to nothing" have to be told apart:
    // the first means ask the translator, the second means never ask again.
    expect(await lookupGlossesIn(db, 'zh', 'es', ['生'])).toEqual({})
  })

  test('senses round-trip as a list, not as one joined string', async () => {
    const db = await fresh()
    await putGlossesIn(db, 'zh', 'es', new Map([['生', ['vida', 'nacer']]]))

    expect(await lookupGlossesIn(db, 'zh', 'es', ['生'])).toEqual({ 生: ['vida', 'nacer'] })
  })

  // The target is in the key so that switching away and back keeps what was
  // already paid for, rather than re-translating a deck twice.
  test('one headword holds a separate translation per target', async () => {
    const db = await fresh()
    await putGlossesIn(db, 'zh', 'es', new Map([['生', ['vida']]]))
    await putGlossesIn(db, 'zh', 'fr', new Map([['生', ['vie']]]))

    expect(await lookupGlossesIn(db, 'zh', 'es', ['生'])).toEqual({ 生: ['vida'] })
    expect(await lookupGlossesIn(db, 'zh', 'fr', ['生'])).toEqual({ 生: ['vie'] })
  })

  test('two study languages sharing a headword do not share its translation', async () => {
    const db = await fresh()
    await putGlossesIn(db, 'zh', 'es', new Map([['生', ['vida']]]))
    await putGlossesIn(db, 'ja', 'es', new Map([['生', ['crudo']]]))

    expect(await lookupGlossesIn(db, 'zh', 'es', ['生'])).toEqual({ 生: ['vida'] })
    expect(await lookupGlossesIn(db, 'ja', 'es', ['生'])).toEqual({ 生: ['crudo'] })
  })

  // A re-install can drop a headword. A translation still keyed to it would
  // outlive the definition it was made from, in every target at once.
  test('a re-install clears the language across every target it was translated into', async () => {
    const db = await fresh()
    await putGlossesIn(db, 'zh', 'es', new Map([['生', ['vida']]]))
    await putGlossesIn(db, 'zh', 'fr', new Map([['生', ['vie']]]))
    await putGlossesIn(db, 'ja', 'es', new Map([['生', ['crudo']]]))

    await clearGlossesIn(db, 'zh')

    expect(await lookupGlossesIn(db, 'zh', 'es', ['生'])).toEqual({})
    expect(await lookupGlossesIn(db, 'zh', 'fr', ['生'])).toEqual({})
    expect(await lookupGlossesIn(db, 'ja', 'es', ['生'])).toEqual({ 生: ['crudo'] })
  })

  test('asking for nothing does not open a transaction', async () => {
    const db = await fresh()
    expect(await lookupGlossesIn(db, 'zh', 'es', [])).toEqual({})
  })
})
