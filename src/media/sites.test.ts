import { describe, expect, test } from 'vitest'
import { siteFor } from './sites'

describe('siteFor', () => {
  test('recognises a Bilibili video page', () => {
    expect(siteFor('https://www.bilibili.com/video/BV1bVuo6AESP')?.name).toBe('bilibili')
  })

  test('recognises a Bilibili page with no video on it', () => {
    // The host is the question here, not whether an id parses. A homepage
    // belongs to Bilibili and has nothing to annotate, which is a different
    // answer from a page we do not serve at all.
    expect(siteFor('https://www.bilibili.com/')?.name).toBe('bilibili')
  })

  test('recognises the bare domain and other subdomains', () => {
    expect(siteFor('https://bilibili.com/video/BV1')?.name).toBe('bilibili')
    expect(siteFor('https://m.bilibili.com/video/BV1')?.name).toBe('bilibili')
  })

  test('is not fooled by a host that merely ends in the same letters', () => {
    // `notbilibili.com` must not match, which a bare `includes` would allow.
    expect(siteFor('https://notbilibili.com/video/BV1')).toBeNull()
    expect(siteFor('https://bilibili.com.evil.test/video/BV1')).toBeNull()
  })

  test('is null for a site with no adapter', () => {
    expect(siteFor('https://example.com/watch?v=abc')).toBeNull()
  })

  test('is null rather than throwing for something that is not a URL', () => {
    expect(siteFor('not a url')).toBeNull()
  })
})
