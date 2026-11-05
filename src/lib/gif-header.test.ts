import { describe, expect, it } from 'vitest'

import { readGifDimensions } from '@/lib/gif-header'

function gifHeader(signature: string, width: number, height: number) {
  return new Uint8Array([
    ...Array.from(signature, (c) => c.charCodeAt(0)),
    width & 0xff,
    width >> 8,
    height & 0xff,
    height >> 8,
    0,
    0,
    0,
  ])
}

describe('readGifDimensions', () => {
  it('reads the little-endian logical screen size', () => {
    expect(readGifDimensions(gifHeader('GIF89a', 816, 816))).toEqual({
      width: 816,
      height: 816,
    })
    expect(readGifDimensions(gifHeader('GIF87a', 1088, 608))).toEqual({
      width: 1088,
      height: 608,
    })
  })

  it('rejects non-GIF bytes, truncated headers and zero sizes', () => {
    expect(readGifDimensions(gifHeader('PNG\r\n\x1a', 10, 10))).toBeNull()
    expect(readGifDimensions(new Uint8Array([71, 73, 70]))).toBeNull()
    expect(readGifDimensions(gifHeader('GIF89a', 0, 10))).toBeNull()
  })
})
