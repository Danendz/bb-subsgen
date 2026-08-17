import { describe, expect, test } from 'vitest'
import { hostLabel, originFromInput, sortedSites } from './sites'

describe('originFromInput', () => {
  test('assumes https for a bare domain', () => {
    expect(originFromInput('zhihu.com')).toBe('https://zhihu.com')
  })

  test('keeps a subdomain, which is part of the origin', () => {
    expect(originFromInput('www.zhihu.com')).toBe('https://www.zhihu.com')
  })

  test('drops everything after the origin', () => {
    expect(originFromInput('https://zhihu.com/question/123?sort=new#top')).toBe(
      'https://zhihu.com',
    )
  })

  test('keeps a port, because Chrome treats it as a different origin', () => {
    expect(originFromInput('localhost:3000')).toBe('https://localhost:3000')
  })

  test('leaves an explicit http alone rather than upgrading it', () => {
    expect(originFromInput('http://example.test')).toBe('http://example.test')
  })

  test('tolerates the padding a paste brings with it', () => {
    expect(originFromInput('  https://zhihu.com/  ')).toBe('https://zhihu.com')
  })

  test.each([
    ['', 'nothing typed'],
    ['   ', 'whitespace only'],
    ['chrome://extensions', 'a scheme content scripts cannot reach'],
    ['file:///Users/me/page.html', 'a local file'],
    ['not a domain', 'a phrase rather than a host'],
  ])('rejects %j — %s', (input) => {
    expect(originFromInput(input)).toBeNull()
  })
})

describe('hostLabel', () => {
  test('drops the scheme', () => {
    expect(hostLabel('https://www.zhihu.com')).toBe('www.zhihu.com')
  })

  test('keeps the port, since that is what makes it a separate site', () => {
    expect(hostLabel('http://localhost:8080')).toBe('localhost:8080')
  })
})

describe('sortedSites', () => {
  test('orders by name, not by when it was granted', () => {
    expect(sortedSites(['https://zhihu.com', 'https://baidu.com', 'https://www.bilibili.com'])).toEqual([
      'https://baidu.com',
      'https://www.bilibili.com',
      'https://zhihu.com',
    ])
  })

  test('leaves the caller’s array alone', () => {
    const origins = ['https://zhihu.com', 'https://baidu.com']
    sortedSites(origins)
    expect(origins).toEqual(['https://zhihu.com', 'https://baidu.com'])
  })
})
