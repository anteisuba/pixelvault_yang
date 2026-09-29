import { describe, expect, it } from 'vitest'

import {
  detectGridCells,
  equalGridCells,
  scaleCells,
  wrapStoryboardGridPrompt,
} from '@/lib/storyboard-grid'

/**
 * 画一张合成的宫格亮度图：四周 `margin` 宽的白边，格与格之间 `gutter` 宽的缝，
 * 格子里是有起伏的内容（不是纯色，免得被当成缝）。
 */
function synthGrid(options: {
  size: 3 | 2
  cellW: number
  cellH: number
  gutter: number
  margin: number
  gutterValue?: number
}): { luma: Uint8ClampedArray; width: number; height: number } {
  const { size, cellW, cellH, gutter, margin } = options
  const gutterValue = options.gutterValue ?? 255
  const width = margin * 2 + size * cellW + (size - 1) * gutter
  const height = margin * 2 + size * cellH + (size - 1) * gutter
  const luma = new Uint8ClampedArray(width * height).fill(gutterValue)
  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c < size; c += 1) {
      const x0 = margin + c * (cellW + gutter)
      const y0 = margin + r * (cellH + gutter)
      for (let y = 0; y < cellH; y += 1) {
        for (let x = 0; x < cellW; x += 1) {
          luma[(y0 + y) * width + x0 + x] =
            60 + ((x * 7 + y * 13 + r * 31 + c * 17) % 120)
        }
      }
    }
  }
  return { luma, width, height }
}

describe('wrapStoryboardGridPrompt', () => {
  it('embeds the story inside the storyboard template', () => {
    const wrapped = wrapStoryboardGridPrompt(
      '  雨夜的天台，她等了很久，最后转身离开 ',
    )
    expect(wrapped).toContain('3×3 storyboard grid')
    expect(wrapped).toContain('雨夜的天台，她等了很久，最后转身离开')
    expect(wrapped).not.toContain('{story}')
  })

  it('leaves an empty prompt alone', () => {
    expect(wrapStoryboardGridPrompt('   ')).toBe('   ')
  })
})

describe('detectGridCells', () => {
  it('finds nine cells between white gutters and trims the outer margin', () => {
    const { luma, width, height } = synthGrid({
      size: 3,
      cellW: 60,
      cellH: 34,
      gutter: 3,
      margin: 5,
    })
    const cells = detectGridCells(luma, width, height, 3)
    expect(cells).toHaveLength(9)
    expect(cells![0]).toEqual({ x: 5, y: 5, width: 60, height: 34 })
    expect(cells![4]).toEqual({ x: 5 + 63, y: 5 + 37, width: 60, height: 34 })
    expect(cells![8]).toEqual({ x: 5 + 126, y: 5 + 74, width: 60, height: 34 })
  })

  it('accepts dark gutters too', () => {
    const { luma, width, height } = synthGrid({
      size: 3,
      cellW: 50,
      cellH: 50,
      gutter: 2,
      margin: 0,
      gutterValue: 5,
    })
    expect(detectGridCells(luma, width, height, 3)).toHaveLength(9)
  })

  it('reads a 2×2 sheet', () => {
    const { luma, width, height } = synthGrid({
      size: 2,
      cellW: 80,
      cellH: 45,
      gutter: 2,
      margin: 3,
    })
    expect(detectGridCells(luma, width, height, 2)).toHaveLength(4)
  })

  it('refuses an image with no gutters instead of guessing', () => {
    const width = 180
    const height = 100
    const luma = new Uint8ClampedArray(width * height)
    for (let i = 0; i < luma.length; i += 1) luma[i] = 40 + (i % 97)
    expect(detectGridCells(luma, width, height, 3)).toBeNull()
  })

  it('refuses a sheet whose panels are badly uneven', () => {
    // 一条缝落在 1/5 处而不是 1/3：离理论线太远，不认。
    const width = 200
    const height = 90
    const luma = new Uint8ClampedArray(width * height)
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const gutter = x === 40 || x === 133 || y === 30 || y === 60
        luma[y * width + x] = gutter ? 255 : 50 + ((x * 3 + y * 5) % 100)
      }
    }
    expect(detectGridCells(luma, width, height, 3)).toBeNull()
  })
})

describe('equalGridCells / scaleCells', () => {
  it('splits evenly and covers the whole image', () => {
    const cells = equalGridCells(301, 150, 3)
    expect(cells).toHaveLength(9)
    expect(cells[0]).toEqual({ x: 0, y: 0, width: 100, height: 50 })
    expect(cells[8]!.x + cells[8]!.width).toBe(301)
    expect(cells[8]!.y + cells[8]!.height).toBe(150)
  })

  it('scales inward so a gutter pixel never leaks into a cell', () => {
    const [cell] = scaleCells([{ x: 5, y: 5, width: 60, height: 34 }], 4.27)
    expect(cell!.x).toBe(Math.ceil(5 * 4.27))
    expect(cell!.x + cell!.width).toBe(Math.floor(65 * 4.27))
  })
})
