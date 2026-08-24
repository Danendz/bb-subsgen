import { describe, expect, test } from 'vitest'
import type { Sense, Tag } from '../pack'
import { parseDefinitions } from './definitions'
import { readingParts } from './reading'

/** What the senses say, which is all these cases are about. */
const glosses = (result: { senses: Sense[] }): string[] => result.senses.map((sense) => sense.gloss)

const cl = (word: string, pinyin: string): Tag => ({
  kind: 'classifier',
  word,
  reading: readingParts(word, pinyin),
})

describe('parseDefinitions', () => {
  test('leaves ordinary definitions untouched', () => {
    const result = parseDefinitions(['to like', 'to be fond of'])
    expect(glosses(result)).toEqual(['to like', 'to be fond of'])
    expect(result.classifiers).toEqual([])
  })

  test('extracts a standalone CL line, preferring simplified', () => {
    // 朋友 in CC-CEDICT: /friend/CL:個|个[ge4],位[wei4]/
    const result = parseDefinitions(['friend', 'CL:個|个[ge4],位[wei4]'])
    expect(glosses(result)).toEqual(['friend'])
    expect(result.classifiers).toEqual([cl('个', 'ge4'), cl('位', 'wei4')])
  })

  test('uses the traditional form when asked', () => {
    const result = parseDefinitions(['friend', 'CL:個|个[ge4]'], true)
    expect(result.classifiers).toEqual([cl('個', 'ge4')])
  })

  test('handles a classifier with no traditional/simplified split', () => {
    const result = parseDefinitions(['CL:把[ba3]'])
    expect(glosses(result)).toEqual([])
    expect(result.classifiers).toEqual([cl('把', 'ba3')])
  })

  test('lifts an embedded (CL:...) out of the definition text', () => {
    const result = parseDefinitions(['light; ray (CL:道[dao4])'])
    expect(glosses(result)).toEqual(['light; ray'])
    expect(result.classifiers).toEqual([cl('道', 'dao4')])
  })

  test('deduplicates classifiers repeated across senses', () => {
    const result = parseDefinitions(['a thing (CL:個|个[ge4])', 'CL:個|个[ge4]'])
    expect(glosses(result)).toEqual(['a thing'])
    expect(result.classifiers).toEqual([cl('个', 'ge4')])
  })

  test('drops a definition that is empty once its classifier is lifted out', () => {
    const result = parseDefinitions(['(CL:套[tao4])'])
    expect(glosses(result)).toEqual([])
    expect(result.classifiers).toEqual([cl('套', 'tao4')])
  })
})

describe('parseDefinitions — cross-reference notation', () => {
  test('renders a trad|simp reference as simplified plus readable pinyin', () => {
    const result = parseDefinitions(['see also 信用證|信用证[xin4 yong4 zheng4]'])
    expect(glosses(result)).toEqual(['see also 信用证 (xìn yòng zhèng)'])
  })

  test('renders a reference with no trad/simp split', () => {
    const result = parseDefinitions(['erhua variant of 事[shi4]'])
    expect(glosses(result)).toEqual(['erhua variant of 事 (shì)'])
  })

  test('handles a bare bracket with no preceding characters', () => {
    const result = parseDefinitions(['Taiwan pr. [jing4]'])
    expect(glosses(result)).toEqual(['Taiwan pr. (jìng)'])
  })

  test('honors the traditional setting for references', () => {
    const result = parseDefinitions(['see also 信用證|信用证[xin4 yong4 zheng4]'], true)
    expect(glosses(result)).toEqual(['see also 信用證 (xìn yòng zhèng)'])
  })

  test('converts every reference when a definition contains more than one', () => {
    const result = parseDefinitions(['between 事[shi4] and 物[wu4]'])
    expect(glosses(result)).toEqual(['between 事 (shì) and 物 (wù)'])
  })

  test('leaves bracket contents that are not tonal pinyin untouched', () => {
    // Proper names keep their separators; syllables without a tone digit
    // have nothing to convert.
    const result = parseDefinitions(['named after 阿[A1 · he4]'])
    expect(glosses(result)).toEqual(['named after 阿 (Ā · hè)'])
  })

  test('leaves a definition with no reference unchanged', () => {
    expect(glosses(parseDefinitions(['to like']))).toEqual(['to like'])
  })

  test('resolves a trad|simp pair that has no pinyin bracket', () => {
    const result = parseDefinitions(['牛郎織女|牛郎织女 are a couple'])
    expect(glosses(result)).toEqual(['牛郎织女 are a couple'])
  })

  test('resolves a bracketless pair to traditional when asked', () => {
    const result = parseDefinitions(['牛郎織女|牛郎织女 are a couple'], true)
    expect(glosses(result)).toEqual(['牛郎織女 are a couple'])
  })

  test('handles a headword containing digits', () => {
    const result = parseDefinitions(['abbr. for 95後|95后[jiu3 wu3 hou4]'])
    expect(glosses(result)).toEqual(['abbr. for 95后 (jiǔ wǔ hòu)'])
  })

  test('handles a headword containing latin letters', () => {
    const result = parseDefinitions(['abbr. for B型超聲|B型超声[B xing2 chao1 sheng1]'])
    expect(glosses(result)).toEqual(['abbr. for B型超声 (B xíng chāo shēng)'])
  })

  test('handles a headword containing a fullwidth comma', () => {
    const result = parseDefinitions(['see 東，馬|东，马[dong1 , ma3]'])
    expect(glosses(result)).toEqual(['see 东，马 (dōng , mǎ)'])
  })

  test('handles a headword containing a wildcard placeholder', () => {
    const result = parseDefinitions(['when followed by ∼的大門|∼的大门'])
    expect(glosses(result)).toEqual(['when followed by ∼的大门'])
  })

  test('does not treat an english word before a bracket as a headword', () => {
    // The headword class requires at least one Han character.
    const result = parseDefinitions(['Taiwan pr. [jing4]'])
    expect(glosses(result)).toEqual(['Taiwan pr. (jìng)'])
  })
})
