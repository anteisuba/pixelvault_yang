import { describe, expect, it } from 'vitest'

import { readImagePixelSize } from './image-pixel-size'

function png(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(33)
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const view = new DataView(bytes.buffer)
  view.setUint32(8, 13)
  bytes.set([0x49, 0x48, 0x44, 0x52], 12) // IHDR
  view.setUint32(16, width)
  view.setUint32(20, height)
  return bytes
}

function jpeg(width: number, height: number): Uint8Array {
  // SOI · APP0(长 16) · SOF0(长 17：精度、高、宽…)
  const bytes = new Uint8Array(2 + 2 + 16 + 2 + 17)
  const view = new DataView(bytes.buffer)
  bytes.set([0xff, 0xd8, 0xff, 0xe0])
  view.setUint16(4, 16)
  const sof = 2 + 2 + 16
  bytes.set([0xff, 0xc0], sof)
  view.setUint16(sof + 2, 17)
  bytes[sof + 4] = 8
  view.setUint16(sof + 5, height)
  view.setUint16(sof + 7, width)
  return bytes
}

function webpVp8x(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(30)
  const ascii = (text: string, at: number) =>
    bytes.set(
      [...text].map((c) => c.charCodeAt(0)),
      at,
    )
  ascii('RIFF', 0)
  ascii('WEBP', 8)
  ascii('VP8X', 12)
  const w = width - 1
  const h = height - 1
  bytes.set([w & 0xff, (w >> 8) & 0xff, (w >> 16) & 0xff], 24)
  bytes.set([h & 0xff, (h >> 8) & 0xff, (h >> 16) & 0xff], 27)
  return bytes
}

function gif(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(13)
  bytes.set([0x47, 0x49, 0x46, 0x38, 0x39, 0x61])
  const view = new DataView(bytes.buffer)
  view.setUint16(6, width, true)
  view.setUint16(8, height, true)
  return bytes
}

describe('readImagePixelSize（作品宽高以真像素为准，11-19）', () => {
  it('PNG：Gemini 16:9 实际 1376×768，不是估的 1792×1024', () => {
    expect(readImagePixelSize(png(1376, 768))).toEqual({
      width: 1376,
      height: 768,
    })
  })

  it('JPEG / WebP(VP8X) / GIF 也读得出', () => {
    expect(readImagePixelSize(jpeg(1376, 768))).toEqual({
      width: 1376,
      height: 768,
    })
    expect(readImagePixelSize(webpVp8x(2048, 1152))).toEqual({
      width: 2048,
      height: 1152,
    })
    expect(readImagePixelSize(gif(320, 240))).toEqual({
      width: 320,
      height: 240,
    })
  })

  it('认不出的字节 = null（调用方退回估值）', () => {
    expect(readImagePixelSize(new Uint8Array([1, 2, 3, 4]))).toBeNull()
    expect(readImagePixelSize(png(0, 768))).toBeNull()
  })
})
