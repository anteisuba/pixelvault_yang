import { describe, expect, it } from 'vitest'

import {
  fileExtensionForMime,
  isSvgImageUrl,
  isSvgMimeType,
  readSvgDimensions,
  sanitizeGeneratedSvg,
  UnsafeSvgError,
} from '@/lib/svg-image'

describe('sanitizeGeneratedSvg', () => {
  it('普通矢量图原样保留（渐变 / url(#id) / 样式）', () => {
    const svg =
      '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><defs><linearGradient id="g"><stop offset="0" stop-color="#f00"/></linearGradient></defs><style>.a{fill:url(#g)}</style><rect class="a" width="10" height="10" fill="url(#g)"/><use href="#g"/></svg>'
    expect(sanitizeGeneratedSvg(svg)).toBe(svg)
  })

  it('script / foreignObject / 动画元素连内容一起丢', () => {
    const out = sanitizeGeneratedSvg(
      '<svg><script>alert(1)</script><foreignObject><div>x</div></foreignObject><set attributeName="href" to="javascript:alert(1)"/><circle r="1"/></svg>',
    )
    expect(out).toBe('<svg><circle r="1"/></svg>')
  })

  it('事件属性、javascript: 链接、外链 href 都去掉；<a> 拆壳留内容', () => {
    const out = sanitizeGeneratedSvg(
      '<svg onload="alert(1)"><a href="javascript:alert(1)"><rect ONCLICK="x" width="1"/></a><use xlink:href="https://evil.test/x.svg#a"/><image href="&#106;avascript:alert(1)"/></svg>',
    )
    expect(out).toBe('<svg><rect width="1"/><use/><image/></svg>')
  })

  it('image 只认内嵌位图 data URL', () => {
    const ok = '<svg><image href="data:image/png;base64,AAAA"/></svg>'
    expect(sanitizeGeneratedSvg(ok)).toBe(ok)
    expect(
      sanitizeGeneratedSvg(
        '<svg><image href="data:image/svg+xml;base64,AAAA"/></svg>',
      ),
    ).toBe('<svg><image/></svg>')
  })

  it('样式里的外链 / @import 整段丢掉；属性里的外链 url() 丢掉', () => {
    expect(
      sanitizeGeneratedSvg(
        '<svg><style>@import url(https://evil.test/a.css);</style><rect style="fill:url(https://evil.test/p)" fill="url(http://x)"/></svg>',
      ),
    ).toBe('<svg><style></style><rect/></svg>')
  })

  it('注释、非 xml 的处理指令丢掉', () => {
    expect(
      sanitizeGeneratedSvg(
        '<?xml-stylesheet href="https://evil.test/a.css"?><!-- hi --><svg><g/></svg>',
      ),
    ).toBe('<svg><g/></svg>')
  })

  it('实体定义 / 根不是 svg → 抛错', () => {
    expect(() =>
      sanitizeGeneratedSvg('<!DOCTYPE svg [<!ENTITY x "y">]><svg>&x;</svg>'),
    ).toThrow(UnsafeSvgError)
    expect(() => sanitizeGeneratedSvg('<html><svg/></html>')).toThrow(
      UnsafeSvgError,
    )
    expect(() => sanitizeGeneratedSvg('not svg')).toThrow(UnsafeSvgError)
  })
})

describe('readSvgDimensions', () => {
  it('width / height 优先', () => {
    expect(
      readSvgDimensions('<svg width="800" height="600px" viewBox="0 0 8 6">'),
    ).toEqual({ width: 800, height: 600 })
  })
  it('只有 viewBox', () => {
    expect(readSvgDimensions('<svg viewBox="0 0 1536 1024">')).toEqual({
      width: 1536,
      height: 1024,
    })
  })
  it('缺一边按 viewBox 比例补；百分比 / 无信息 → null', () => {
    expect(readSvgDimensions('<svg width="200" viewBox="0 0 4 2">')).toEqual({
      width: 200,
      height: 100,
    })
    expect(readSvgDimensions('<svg width="100%" height="100%">')).toBeNull()
    expect(readSvgDimensions('<g/>')).toBeNull()
  })
})

describe('SVG 判别 / 扩展名', () => {
  it('URL 与 MIME', () => {
    expect(isSvgImageUrl('https://cdn.test/generations/u/image/a.svg')).toBe(
      true,
    )
    expect(isSvgImageUrl('https://cdn.test/a.SVG?v=1')).toBe(true)
    expect(isSvgImageUrl('data:image/svg+xml;base64,AAA')).toBe(true)
    expect(isSvgImageUrl('https://cdn.test/a.png')).toBe(false)
    expect(isSvgImageUrl(undefined)).toBe(false)
    expect(isSvgMimeType('image/svg+xml; charset=utf-8')).toBe(true)
    expect(isSvgMimeType('image/png')).toBe(false)
  })
  it('下载扩展名', () => {
    expect(fileExtensionForMime('image/svg+xml')).toBe('svg')
    expect(fileExtensionForMime('image/jpeg')).toBe('jpg')
    expect(fileExtensionForMime('image/webp')).toBe('webp')
    expect(fileExtensionForMime(undefined)).toBe('png')
  })
})
