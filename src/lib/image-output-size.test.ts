import { describe, expect, it } from 'vitest'

import { openAIGifFrameSize } from '@/lib/image-output-size'

// GIF 每帧尺寸（owner 2026-11-05 gif-output Q3「比例照选」）：官方每帧总像素下限
// 655,360、边长 16 的倍数、比例 1:3–3:1 —— 每帧取下限，帧数才放得下。
describe('openAIGifFrameSize', () => {
  it('uses the smallest legal frame for a square GIF', () => {
    expect(openAIGifFrameSize('1:1')).toEqual({
      size: '816x816',
      width: 816,
      height: 816,
    })
  })

  it.each(['16:9', '9:16', '4:3', '3:2', '21:9'])(
    'keeps %s on the 16-pixel grid at or just above the pixel floor',
    (ratio) => {
      const { width, height, size } = openAIGifFrameSize(ratio)
      expect(width % 16).toBe(0)
      expect(height % 16).toBe(0)
      expect(width * height).toBeGreaterThanOrEqual(655_360)
      expect(width * height).toBeLessThan(655_360 * 1.15)
      expect(size).toBe(`${width}x${height}`)
      const [w, h] = ratio.split(':').map(Number)
      expect(width >= height).toBe(w >= h)
    },
  )
})
