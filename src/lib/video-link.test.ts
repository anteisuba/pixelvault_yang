import { describe, expect, it } from 'vitest'

import {
  buildYoutubeWatchUrl,
  classifyVideoLink,
  normalizeVideoLinkUrl,
  resolveVideoLinkLine,
} from '@/lib/video-link'
import { extractUrlsFromText } from '@/lib/research-intent'

describe('classifyVideoLink — YouTube', () => {
  it.each([
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://youtube.com/watch?v=dQw4w9WgXcQ&t=42s', 'dQw4w9WgXcQ'],
    ['https://m.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://music.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://youtu.be/dQw4w9WgXcQ?si=abcdef', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/shorts/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/live/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/embed/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['http://youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
  ])('%s → youtube', (url, videoId) => {
    expect(classifyVideoLink(url)).toEqual({ kind: 'youtube', videoId })
  })

  it.each([
    'https://www.youtube.com/@somechannel',
    'https://www.youtube.com/playlist?list=PL1234567890',
    'https://www.youtube.com/',
    // id 形状不对（10 位）—— 宁可当普通网页，也不要拿一个假 id 去直传。
    'https://www.youtube.com/watch?v=short',
  ])('%s is not a video page → web', (url) => {
    expect(classifyVideoLink(url)).toEqual({ kind: 'web' })
  })

  it('canonicalizes to the shape slice 0 actually measured', () => {
    expect(buildYoutubeWatchUrl('dQw4w9WgXcQ')).toBe(
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    )
  })
})

describe('classifyVideoLink — video files', () => {
  it.each([
    'https://cdn.example.com/clips/reference.mp4',
    'https://cdn.example.com/clips/reference.MOV',
    'https://cdn.example.com/a/b/c.webm?token=abc&expires=123',
    'https://pub-abc.r2.dev/videos/shot-01.mp4',
  ])('%s → video-file', (url) => {
    expect(classifyVideoLink(url)).toEqual({ kind: 'video-file' })
  })

  it('does not treat a page that merely mentions mp4 as a direct link', () => {
    expect(classifyVideoLink('https://example.com/mp4-guide')).toEqual({
      kind: 'web',
    })
  })
})

describe('classifyVideoLink — platform pages (no stream resolving)', () => {
  it('reads the BV id out of a bilibili video page', () => {
    expect(
      classifyVideoLink('https://www.bilibili.com/video/BV1GJ411x7h7'),
    ).toEqual({
      kind: 'platform-page',
      platform: 'bilibili',
      id: 'BV1GJ411x7h7',
    })
  })

  it('keeps trailing path/query noise out of the BV id', () => {
    expect(
      classifyVideoLink('https://www.bilibili.com/video/BV1GJ411x7h7/?p=2'),
    ).toEqual({
      kind: 'platform-page',
      platform: 'bilibili',
      id: 'BV1GJ411x7h7',
    })
  })

  it('marks b23.tv short links without inventing an id', () => {
    expect(classifyVideoLink('https://b23.tv/aBcDeF')).toEqual({
      kind: 'platform-page',
      platform: 'bilibili',
    })
  })

  it('leaves non-video bilibili pages to the retrieval line', () => {
    expect(classifyVideoLink('https://space.bilibili.com/12345')).toEqual({
      kind: 'web',
    })
    expect(classifyVideoLink('https://www.bilibili.com/read/cv123')).toEqual({
      kind: 'web',
    })
  })

  it.each([
    ['https://x.com/someone/status/1234567890', '1234567890'],
    ['https://twitter.com/someone/status/1234567890?s=20', '1234567890'],
    ['https://x.com/i/status/1234567890', '1234567890'],
  ])('%s → x post', (url, id) => {
    expect(classifyVideoLink(url)).toEqual({
      kind: 'platform-page',
      platform: 'x',
      id,
    })
  })

  it('leaves an X profile to the retrieval line', () => {
    expect(classifyVideoLink('https://x.com/someone')).toEqual({ kind: 'web' })
  })

  it.each([
    ['https://www.douyin.com/video/7123456789', '7123456789'],
    ['https://www.iesdouyin.com/share/video/7123456789/', '7123456789'],
  ])('%s → douyin post', (url, id) => {
    expect(classifyVideoLink(url)).toEqual({
      kind: 'platform-page',
      platform: 'douyin',
      id,
    })
  })

  it('marks douyin short links without an id', () => {
    expect(classifyVideoLink('https://v.douyin.com/aBcDeF/')).toEqual({
      kind: 'platform-page',
      platform: 'douyin',
    })
  })
})

describe('classifyVideoLink — everything else', () => {
  it.each([
    'https://en.wikipedia.org/wiki/Cinematography',
    'https://civitai.com/models/1234',
    // 裸域名不是 URL —— 分类器必须是全函数，不许抛。
    'youtube.com/watch?v=dQw4w9WgXcQ',
    'www.bilibili.com/video/BV1GJ411x7h7',
    'not a url at all',
    '',
    'ftp://example.com/movie.mp4',
    'javascript:alert(1)',
    'data:video/mp4;base64,AAAA',
  ])('%s → web', (url) => {
    expect(classifyVideoLink(url)).toEqual({ kind: 'web' })
  })
})

describe('trailing punctuation from the shared URL extractor', () => {
  // 共享的 `extractUrlsFromText` 只剥 ASCII 的 .,; —— 中文句号会留在 URL 里。
  // 分类器必须自己扛住，否则中文对话里贴的链接大多数会被误判成普通网页。
  it('survives a Chinese full stop glued to the link', () => {
    const [url] = extractUrlsFromText(
      '帮我看看这个 https://www.youtube.com/watch?v=dQw4w9WgXcQ。',
    )
    expect(url).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ。')
    expect(classifyVideoLink(url)).toEqual({
      kind: 'youtube',
      videoId: 'dQw4w9WgXcQ',
    })
  })

  it('normalizes the url the caller should actually fetch', () => {
    expect(normalizeVideoLinkUrl('https://cdn.example.com/a.mp4，')).toBe(
      'https://cdn.example.com/a.mp4',
    )
  })
})

// ── 一条 URL 只能被一条线认领 ────────────────────────────────────
describe('resolveVideoLinkLine', () => {
  it.each([
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'vision'],
    ['https://youtu.be/dQw4w9WgXcQ', 'vision'],
    ['https://cdn.example.com/shot-01.mp4', 'vision'],
    // 平台页不解流（边界 16）——它的产物是元数据卡，那是检索线的活。
    ['https://www.bilibili.com/video/BV1GJ411x7h7', 'research'],
    ['https://x.com/someone/status/1234567890', 'research'],
    ['https://www.douyin.com/video/7300000000000000000', 'research'],
    // 视频 id 认不出来的 YouTube 页（频道页）退回普通网页 —— 归检索线。
    ['https://www.youtube.com/@3blue1brown', 'research'],
    ['https://example.com/post', 'research'],
  ])('%s → %s', (url, line) => {
    expect(resolveVideoLinkLine(url)).toBe(line)
  })

  it('尾随中文标点不影响归属判定', () => {
    expect(
      resolveVideoLinkLine('https://www.youtube.com/watch?v=dQw4w9WgXcQ。'),
    ).toBe('vision')
  })
})
