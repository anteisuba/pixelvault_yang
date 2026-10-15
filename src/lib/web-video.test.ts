import { describe, expect, it } from 'vitest'

import {
  formatVideoDuration,
  parseVideoDurationSeconds,
  resolveWebVideo,
} from '@/lib/web-video'

/**
 * 找到的视频 → 平台 + 官方嵌入地址（搜索期第二片）。服务端定平台、面板算嵌入地址
 * 用的是同一个函数，所以这里锁住的就是「哪些能在面板里播、哪些新窗口开」。
 */
describe('resolveWebVideo — YouTube', () => {
  it.each([
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://youtube.com/watch?v=dQw4w9WgXcQ&t=42s',
    'https://m.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://youtu.be/dQw4w9WgXcQ?si=abcdef',
    'https://www.youtube.com/shorts/dQw4w9WgXcQ',
    'http://youtube.com/watch?v=dQw4w9WgXcQ',
  ])('%s → youtube-nocookie 嵌入', (url) => {
    expect(resolveWebVideo(url)).toEqual({
      platform: 'youtube',
      embedUrl: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    })
  })

  it.each([
    'https://www.youtube.com/@somechannel',
    'https://www.youtube.com/playlist?list=PL1234567890',
    'https://www.youtube.com/watch?v=short',
  ])('%s → 认得出平台、认不出稿件号：新窗口', (url) => {
    expect(resolveWebVideo(url)).toEqual({
      platform: 'youtube',
      embedUrl: null,
    })
  })
})

describe('resolveWebVideo — B站', () => {
  it('BV 号 → 官方播放器，autoplay=0', () => {
    expect(
      resolveWebVideo('https://www.bilibili.com/video/BV1ji421e7nM/'),
    ).toEqual({
      platform: 'bilibili',
      embedUrl:
        'https://player.bilibili.com/player.html?bvid=BV1ji421e7nM&autoplay=0',
    })
  })

  it('av 号 → aid；分 P 只认正整数', () => {
    expect(
      resolveWebVideo('http://www.bilibili.com/video/av170001?p=2').embedUrl,
    ).toBe('https://player.bilibili.com/player.html?aid=170001&p=2&autoplay=0')
    expect(
      resolveWebVideo('https://m.bilibili.com/video/BV1ji421e7nM?p=abc')
        .embedUrl,
    ).toBe(
      'https://player.bilibili.com/player.html?bvid=BV1ji421e7nM&autoplay=0',
    )
  })

  it.each([
    // 短链：跟跳转要发请求，浏览器里做不了 —— 认得出 B站、认不出稿件号。
    'https://b23.tv/AbCdEf1',
    'https://space.bilibili.com/12345',
    'https://www.bilibili.com/read/cv123',
    'https://www.bilibili.com/video/BVshort',
  ])('%s → B站、新窗口', (url) => {
    expect(resolveWebVideo(url)).toEqual({
      platform: 'bilibili',
      embedUrl: null,
    })
  })
})

describe('resolveWebVideo — niconico / Vimeo', () => {
  it.each([
    ['https://www.nicovideo.jp/watch/sm9', 'sm9'],
    ['https://sp.nicovideo.jp/watch/so123456', 'so123456'],
    ['https://nico.ms/sm9', 'sm9'],
  ])('%s → embed.nicovideo.jp', (url, id) => {
    expect(resolveWebVideo(url)).toEqual({
      platform: 'niconico',
      embedUrl: `https://embed.nicovideo.jp/watch/${id}`,
    })
  })

  it('niconico 的非稿件页 → 新窗口', () => {
    expect(resolveWebVideo('https://www.nicovideo.jp/user/123')).toEqual({
      platform: 'niconico',
      embedUrl: null,
    })
  })

  it.each([
    ['https://vimeo.com/76979871', 'https://player.vimeo.com/video/76979871'],
    [
      'https://vimeo.com/channels/staffpicks/76979871',
      'https://player.vimeo.com/video/76979871',
    ],
    [
      'https://vimeo.com/76979871/abcdef1234',
      'https://player.vimeo.com/video/76979871?h=abcdef1234',
    ],
    [
      'https://player.vimeo.com/video/76979871?h=abcdef1234',
      'https://player.vimeo.com/video/76979871?h=abcdef1234',
    ],
    [
      'https://vimeo.com/groups/motion/videos/76979871',
      'https://player.vimeo.com/video/76979871',
    ],
  ])('%s → %s', (url, embedUrl) => {
    expect(resolveWebVideo(url)).toEqual({ platform: 'vimeo', embedUrl })
  })

  it.each([
    'https://vimeo.com/channels/staffpicks',
    // 合集号不是稿件号：⛔ 嵌进去是一个打不开的播放器。
    'https://vimeo.com/showcase/1234567',
    'https://vimeo.com/album/1234567',
  ])('Vimeo 没有稿件号的页 %s → 新窗口', (url) => {
    expect(resolveWebVideo(url)).toEqual({
      platform: 'vimeo',
      embedUrl: null,
    })
  })
})

describe('resolveWebVideo — 别的', () => {
  it.each([
    'https://www.tiktok.com/@a/video/123',
    'https://example.com/youtube.com/watch?v=dQw4w9WgXcQ',
    // 仿冒的注册域：⛔ 只按后缀匹配会把它当成 YouTube。
    'https://notyoutube.com/watch?v=dQw4w9WgXcQ',
    'javascript:alert(1)',
    'not a url',
  ])('%s → other，⛔ 不嵌', (url) => {
    expect(resolveWebVideo(url)).toEqual({ platform: 'other', embedUrl: null })
  })
})

describe('parseVideoDurationSeconds', () => {
  it.each([
    ['3:29', 209],
    ['1:02:03', 3723],
    ['PT1H2M3S', 3723],
    ['PT45S', 45],
    ['pt3m', 180],
    [' 12:40 ', 760],
    [95, 95],
    [95.4, 95],
  ] as const)('%s → %s 秒', (value, seconds) => {
    expect(parseVideoDurationSeconds(value)).toBe(seconds)
  })

  it.each([
    ['0:00'],
    ['3:75'],
    ['1:60:00'],
    ['PT'],
    ['soon'],
    [''],
    [0],
    [-5],
    [86_401],
    [null],
    [undefined],
  ] as const)('%s → 缺席（⛔ 不回落成 0）', (value) => {
    expect(parseVideoDurationSeconds(value)).toBeUndefined()
  })
})

describe('formatVideoDuration', () => {
  it.each([
    [5, '0:05'],
    [209, '3:29'],
    [760, '12:40'],
    [3723, '1:02:03'],
  ])('%s 秒 → %s', (seconds, text) => {
    expect(formatVideoDuration(seconds)).toBe(text)
  })
})
