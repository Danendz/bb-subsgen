// @vitest-environment jsdom
import { beforeEach, describe, expect, test } from 'vitest'
import {
  blockAncestor,
  createBlockCache,
  flattenBlock,
  locate,
  rangeOf,
  rootElement,
} from './block'

function render(html: string): HTMLElement {
  document.body.innerHTML = html
  return document.body.firstElementChild as HTMLElement
}

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('flattenBlock', () => {
  test('joins text split across inline elements into one string', () => {
    // The whole reason this module exists: 大学学习 straddles the </a>.
    const p = render('<p>他在<a href="#">北京大学</a>学习中文。</p>')
    expect(flattenBlock(p).text).toBe('他在北京大学学习中文。')
  })

  test('omits script and style content', () => {
    const p = render('<p>学习<script>var x = "中文"</script><style>.a{}</style>汉语</p>')
    expect(flattenBlock(p).text).toBe('学习汉语')
  })

  test('omits ruby annotations but keeps the base text', () => {
    // rt holds a reading that would otherwise be spliced into the middle of a word.
    const p = render('<p><ruby>学习<rt>xuéxí</rt></ruby>中文</p>')
    expect(flattenBlock(p).text).toBe('学习中文')
  })

  test('omits our own overlay', () => {
    const p = render('<p>学习<span id="bb-subsgen-host">popup text</span>中文</p>')
    expect(flattenBlock(p).text).toBe('学习中文')
  })

  test('omits hidden elements', () => {
    const p = render('<p>学习<span hidden>隐藏</span>中文</p>')
    expect(flattenBlock(p).text).toBe('学习中文')
  })
})

describe('locate', () => {
  test('maps an index back to the node it came from', () => {
    const p = render('<p>他在<a href="#">北京大学</a>学习</p>')
    const block = flattenBlock(p)

    // Index 3 is 京, inside the anchor's text node at offset 1.
    const found = locate(block, 3)
    expect(found?.node.data).toBe('北京大学')
    expect(found?.offset).toBe(1)
  })

  test('maps an index in the first chunk', () => {
    const p = render('<p>他在<a href="#">北京</a></p>')
    const found = locate(flattenBlock(p), 0)
    expect(found?.node.data).toBe('他在')
    expect(found?.offset).toBe(0)
  })

  test('maps the very end of the text', () => {
    const p = render('<p>学习</p>')
    expect(locate(flattenBlock(p), 2)).toEqual({ node: expect.anything(), offset: 2 })
  })
})

describe('rangeOf', () => {
  test('builds a range spanning an element boundary', () => {
    const p = render('<p>他在<a href="#">北京大学</a>学习中文。</p>')
    const block = flattenBlock(p)

    // 大学学习 — starts inside the anchor (offset 2 of 北京大学), ends
    // outside it (offset 2 of 学习中文。).
    const range = rangeOf(block, 4, 8)
    expect(range?.toString()).toBe('大学学习')
  })

  test('builds a range inside a single node', () => {
    const p = render('<p>他在北京大学学习中文。</p>')
    expect(rangeOf(flattenBlock(p), 2, 6)?.toString()).toBe('北京大学')
  })
})

describe('blockAncestor', () => {
  test('skips inline ancestors and returns the block', () => {
    const p = render('<p>他在<a href="#"><span>北京</span></a>学习</p>')
    const inner = p.querySelector('span')!.firstChild!
    expect(blockAncestor(inner)).toBe(p)
  })

  test('returns the element itself when it is already a block', () => {
    const p = render('<p>学习中文</p>')
    expect(blockAncestor(p.firstChild!)).toBe(p)
  })

  test('stops at the shadow root when every ancestor inside it is inline', () => {
    // A Bilibili comment exactly: span inside a p that the site styles inline,
    // five shadow roots deep. `parentElement` is null at the boundary, so the
    // walk used to run out and return null — which read as "no text here" and
    // is why hovering a comment did nothing.
    const host = render('<div></div>')
    const shadow = host.attachShadow({ mode: 'open' })
    shadow.innerHTML = '<p style="display: inline"><span>学习中文</span></p>'
    const text = shadow.querySelector('span')!.firstChild!

    expect(blockAncestor(text)).toBe(shadow)
  })

  test('prefers a block inside the shadow tree over the root itself', () => {
    const host = render('<div></div>')
    const shadow = host.attachShadow({ mode: 'open' })
    shadow.innerHTML = '<div class="body"><span>学习中文</span></div>'
    const text = shadow.querySelector('span')!.firstChild!

    expect(blockAncestor(text)).toBe(shadow.querySelector('.body'))
  })

  test('never crosses out of a shadow tree to the host', () => {
    // Crossing would be worse than returning null: flattenBlock's TreeWalker
    // doesn't descend into shadow roots, so a root chosen outside the tree
    // flattens to text that doesn't contain the node the caret landed on.
    const host = render('<section><div></div></section>')
    const inner = host.querySelector('div')!
    const shadow = inner.attachShadow({ mode: 'open' })
    shadow.innerHTML = '<span>学习中文</span>'
    const text = shadow.querySelector('span')!.firstChild!

    const root = blockAncestor(text)
    expect(root).toBe(shadow)
    expect(root).not.toBe(host)
  })
})

describe('rootElement', () => {
  test('maps a shadow root to its host and leaves an element alone', () => {
    const host = render('<div></div>')
    const shadow = host.attachShadow({ mode: 'open' })
    expect(rootElement(shadow)).toBe(host)
    expect(rootElement(host)).toBe(host)
  })
})

describe('flattenBlock across a shadow boundary', () => {
  test('flattens a shadow root the same way it flattens an element', () => {
    const host = render('<div></div>')
    const shadow = host.attachShadow({ mode: 'open' })
    shadow.innerHTML = '<p style="display: inline">他在<a href="#">北京大学</a>学习中文。</p>'

    const block = flattenBlock(shadow)
    expect(block.text).toBe('他在北京大学学习中文。')
    // The range still has to span the </a>, which is the whole point of
    // flattening — a shadow root changes nothing about that.
    expect(rangeOf(block, 4, 8)?.toString()).toBe('大学学习')
  })
})

describe('createBlockCache', () => {
  test('reuses the flattened form for repeated hovers in one block', () => {
    const p = render('<p>他在北京大学学习中文。</p>')
    const cache = createBlockCache()
    expect(cache(p)).toBe(cache(p))
  })

  test('reflattens when the block text changes underneath it', () => {
    const p = render('<p>他在北京大学学习中文。</p>')
    const cache = createBlockCache()
    const first = cache(p)

    p.textContent = '完全不同的内容。'
    const second = cache(p)
    expect(second).not.toBe(first)
    expect(second.text).toBe('完全不同的内容。')
  })

  test('reflattens when a different block is hovered', () => {
    render('<div><p id="a">学习中文</p><p id="b">汉语很难</p></div>')
    const cache = createBlockCache()
    const a = document.getElementById('a')!
    const b = document.getElementById('b')!

    expect(cache(a).text).toBe('学习中文')
    expect(cache(b).text).toBe('汉语很难')
  })

  test('does not treat a block with skipped subtrees as permanently stale', () => {
    // The cache signature is root.textContent, which includes the <rt> the
    // flattened text omits — comparing the two directly would always miss.
    const p = render('<p><ruby>学习<rt>xuéxí</rt></ruby>中文</p>')
    const cache = createBlockCache()
    expect(cache(p)).toBe(cache(p))
  })
})
