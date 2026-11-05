import { describe, expect, it } from 'vitest'

import { GIF_MIME_TYPE, isGifImageUrl, isGifMimeType } from '@/lib/gif-image'

describe('isGifImageUrl', () => {
  it('认 .gif 路径（大小写不敏感、带查询串）与 GIF data URL', () => {
    expect(isGifImageUrl('https://cdn.example.com/u/1/gen.gif')).toBe(true)
    expect(isGifImageUrl('https://cdn.example.com/u/1/GEN.GIF?v=2#x')).toBe(
      true,
    )
    expect(isGifImageUrl('/generations/anim.gif')).toBe(true)
    expect(isGifImageUrl('data:image/gif;base64,R0lGODlhAQABAAAAACw=')).toBe(
      true,
    )
  })

  it('只看路径：查询串里的 .gif、别的格式、空值都不算', () => {
    expect(
      isGifImageUrl('https://cdn.example.com/u/1/gen.png?format=.gif'),
    ).toBe(false)
    expect(isGifImageUrl('https://cdn.example.com/u/1/gen.png')).toBe(false)
    expect(isGifImageUrl('https://cdn.example.com/u/1/gen.gifv')).toBe(false)
    expect(isGifImageUrl('data:image/png;base64,AAAA')).toBe(false)
    expect(isGifImageUrl('')).toBe(false)
    expect(isGifImageUrl(null)).toBe(false)
    expect(isGifImageUrl(undefined)).toBe(false)
  })
})

describe('isGifMimeType', () => {
  it('认 image/gif（忽略大小写与参数）', () => {
    expect(GIF_MIME_TYPE).toBe('image/gif')
    expect(isGifMimeType('image/gif')).toBe(true)
    expect(isGifMimeType('IMAGE/GIF; charset=binary')).toBe(true)
    expect(isGifMimeType('image/png')).toBe(false)
    expect(isGifMimeType(null)).toBe(false)
    expect(isGifMimeType(undefined)).toBe(false)
  })
})
