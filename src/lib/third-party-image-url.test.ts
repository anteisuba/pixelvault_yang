import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  hotlinkProxyImageUrl,
  siteFaviconUrl,
  thirdPartyImageSources,
} from './third-party-image-url'

/**
 * 第三方网图怎么取（附录 I §3.4）：只认站内 Referer 的那几家图床先走自家代理的
 * `/hotlink/`，取不到退回直连；其余一律直连。⛔ 自家 / 其它站的图不改写。
 */

const BASE = 'https://img.anteisuba.com'
const PIXIV = 'https://i.pximg.net/img-master/img/2020/01/01/00/00/00/1_p0.jpg'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('hotlinkProxyImageUrl', () => {
  it('代理没配 = 不改写（回退直连）', () => {
    vi.stubEnv('NEXT_PUBLIC_CIVITAI_IMAGE_PROXY_BASE', '')
    expect(hotlinkProxyImageUrl(PIXIV)).toBeNull()
  })

  it('名单里的图床改写成 /hotlink/<host><path>，保留 query，容忍 base 末尾斜杠', () => {
    vi.stubEnv('NEXT_PUBLIC_CIVITAI_IMAGE_PROXY_BASE', `${BASE}/`)
    expect(hotlinkProxyImageUrl(PIXIV)).toBe(
      `${BASE}/hotlink/i.pximg.net/img-master/img/2020/01/01/00/00/00/1_p0.jpg`,
    )
    expect(
      hotlinkProxyImageUrl('https://i0.hdslb.com/bfs/archive/a.jpg?x=1'),
    ).toBe(`${BASE}/hotlink/i0.hdslb.com/bfs/archive/a.jpg?x=1`)
    expect(hotlinkProxyImageUrl('https://WX1.sinaimg.cn/large/b.jpg')).toBe(
      `${BASE}/hotlink/wx1.sinaimg.cn/large/b.jpg`,
    )
  })

  it('⛔ 名单外、仿冒域、带端口 / userinfo 的一律不改写', () => {
    vi.stubEnv('NEXT_PUBLIC_CIVITAI_IMAGE_PROXY_BASE', BASE)
    for (const url of [
      'https://cdn.example.com/a.jpg',
      'https://i.pximg.net.evil.com/a.jpg',
      'https://evilpximg.net/a.jpg',
      'https://i.pximg.net:8443/a.jpg',
      'https://user@i.pximg.net/a.jpg',
      'data:image/png;base64,AAAA',
      'not a url',
    ]) {
      expect(hotlinkProxyImageUrl(url)).toBeNull()
    }
  })
})

describe('thirdPartyImageSources', () => {
  it('代理在前、直连在后，退路排最后，去重', () => {
    vi.stubEnv('NEXT_PUBLIC_CIVITAI_IMAGE_PROXY_BASE', BASE)
    const thumb = 'https://encrypted-tbn0.gstatic.com/images?q=1'
    expect(thirdPartyImageSources(PIXIV, thumb, thumb, null)).toEqual([
      `${BASE}/hotlink/i.pximg.net/img-master/img/2020/01/01/00/00/00/1_p0.jpg`,
      PIXIV,
      thumb,
    ])
  })

  it('代理没配时就是原地址本身', () => {
    vi.stubEnv('NEXT_PUBLIC_CIVITAI_IMAGE_PROXY_BASE', '')
    expect(thirdPartyImageSources(PIXIV, undefined)).toEqual([PIXIV])
  })

  it('Danbooru 样图先走同源 rewrite，再直连；大图取不到退小图', () => {
    vi.stubEnv('NEXT_PUBLIC_CIVITAI_IMAGE_PROXY_BASE', BASE)
    const large = 'https://cdn.donmai.us/720x720/9b/67/9b67.webp'
    const small = 'https://cdn.donmai.us/180x180/9b/67/9b67.jpg'
    expect(thirdPartyImageSources(large, small)).toEqual([
      '/danbooru-img/720x720/9b/67/9b67.webp',
      large,
      '/danbooru-img/180x180/9b/67/9b67.jpg',
      small,
    ])
    // ⛔ 仿冒域、别的 donmai 子域不改写。
    expect(
      thirdPartyImageSources('https://cdn.donmai.us.evil.com/a.jpg'),
    ).toEqual(['https://cdn.donmai.us.evil.com/a.jpg'])
  })
})

describe('siteFaviconUrl', () => {
  it('取那个站自己的 /favicon.ico（一律 https，⛔ 不走第三方 favicon 服务）', () => {
    expect(siteFaviconUrl('https://zh.moegirl.org.cn/初音未来?x=1#a')).toBe(
      'https://zh.moegirl.org.cn/favicon.ico',
    )
    expect(siteFaviconUrl('http://Example.com/page')).toBe(
      'https://example.com/favicon.ico',
    )
  })

  it('没有地址 / 不是网页地址 / 带端口 = 不取（画地球）', () => {
    for (const url of [
      undefined,
      null,
      '',
      'not a url',
      'javascript:alert(1)',
      'https://example.com:8443/a',
    ]) {
      expect(siteFaviconUrl(url)).toBeNull()
    }
  })
})
