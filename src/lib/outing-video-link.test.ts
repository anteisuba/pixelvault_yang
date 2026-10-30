import { describe, expect, it } from 'vitest'

import { formatVideoRange, parseOutingVideoLink } from './outing-video-link'

describe('parseOutingVideoLink（出门弹框里贴的视频链接）', () => {
  it('认出 B 站 / YouTube / X，规整链接', () => {
    expect(
      parseOutingVideoLink('https://www.bilibili.com/video/BV1GJ411x7h7/?p=1'),
    ).toEqual({
      platform: 'bilibili',
      url: 'https://www.bilibili.com/video/BV1GJ411x7h7',
    })
    expect(parseOutingVideoLink('https://youtu.be/dQw4w9WgXcQ')).toEqual({
      platform: 'youtube',
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    })
    expect(
      parseOutingVideoLink('https://x.com/someone/status/1234567890'),
    ).toEqual({ platform: 'x', url: 'https://x.com/i/status/1234567890' })
  })

  it('后面跟时间段只看那一段；YouTube 自带的 t= 当起点', () => {
    expect(
      parseOutingVideoLink(
        'https://www.bilibili.com/video/BV1GJ411x7h7 3:00-5:30',
      ),
    ).toMatchObject({ start: 180, end: 330 })
    expect(
      parseOutingVideoLink('https://youtu.be/dQw4w9WgXcQ 1:02:03~1:10:00'),
    ).toMatchObject({ start: 3723, end: 4200 })
    expect(
      parseOutingVideoLink('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=90s'),
    ).toMatchObject({ start: 90 })
    // 结束在开始之前：不算时间段。
    expect(
      parseOutingVideoLink('https://youtu.be/dQw4w9WgXcQ 5:00-3:00'),
    ).not.toHaveProperty('end')
  })

  it('普通网址、短链、频道页都不是指定视频', () => {
    expect(parseOutingVideoLink('pixiv.net')).toBeNull()
    expect(parseOutingVideoLink('https://www.pixiv.net/ranking')).toBeNull()
    expect(parseOutingVideoLink('https://b23.tv/abc123')).toBeNull()
    expect(parseOutingVideoLink('https://www.youtube.com/@someone')).toBeNull()
  })

  it('时间段写成「3:00-5:30」「1:02:03-」', () => {
    expect(formatVideoRange({ start: 180, end: 330 })).toBe('3:00-5:30')
    expect(formatVideoRange({ start: 3723 })).toBe('1:02:03-')
    expect(formatVideoRange({})).toBeNull()
  })
})
