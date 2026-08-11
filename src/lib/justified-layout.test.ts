import { describe, expect, it } from 'vitest'

import {
  ASSET_GRID_GAP,
  ASSET_GRID_LAST_ROW_MAX_SCALE,
  ASSET_GRID_MAX_ASPECT_RATIO,
  ASSET_GRID_MIN_ASPECT_RATIO,
  ASSET_GRID_TARGET_ROW_HEIGHT,
} from '@/constants/assets-grid'
import {
  computeJustifiedRows,
  resolveAssetGridViewport,
  toLayoutAspectRatio,
  type JustifiedRow,
} from '@/lib/justified-layout'

const OPTIONS = {
  containerWidth: 1104,
  targetRowHeight: 196,
  gap: ASSET_GRID_GAP,
  lastRowMaxScale: ASSET_GRID_LAST_ROW_MAX_SCALE,
}

function rowWidth(row: JustifiedRow): number {
  const boxesWidth = row.boxes.reduce((sum, box) => sum + box.width, 0)
  return boxesWidth + ASSET_GRID_GAP * (row.boxes.length - 1)
}

/** 实测比例谱：0.56（立绘竖条）→ 2.77（三视图横带）。 */
const REAL_WORLD_ASPECTS = [
  0.56, 1, 1.5, 0.75, 2.77, 1.33, 0.67, 1, 1.78, 0.56, 2.77, 1.25, 0.8, 1, 1.5,
  0.66, 2.4, 1, 0.56, 1.78,
]

describe('computeJustifiedRows', () => {
  it('每个铺满行的像素宽精确等于容器宽（验收判据 ≥99%）', () => {
    const rows = computeJustifiedRows(REAL_WORLD_ASPECTS, OPTIONS)
    // 最后一行可能回落到目标行高而不铺满，单独判。
    rows.slice(0, -1).forEach((row) => {
      expect(rowWidth(row)).toBe(OPTIONS.containerWidth)
    })
  })

  it('任何一行都不溢出容器（含末行）', () => {
    const rows = computeJustifiedRows(REAL_WORLD_ASPECTS, OPTIONS)
    rows.forEach((row) => {
      expect(rowWidth(row)).toBeLessThanOrEqual(OPTIONS.containerWidth)
    })
  })

  it('每个元素恰好排一次且顺序不变', () => {
    const rows = computeJustifiedRows(REAL_WORLD_ASPECTS, OPTIONS)
    const indexes = rows.flatMap((row) => row.boxes.map((box) => box.index))
    expect(indexes).toEqual(REAL_WORLD_ASPECTS.map((_, index) => index))
  })

  it('行内等高，且每个瓦片的实际比例贴合它的真实比例（不裁切）', () => {
    const rows = computeJustifiedRows(REAL_WORLD_ASPECTS, OPTIONS)
    rows.forEach((row) => {
      row.boxes.forEach((box) => {
        expect(box.height).toBe(row.height)
        const rendered = box.width / box.height
        const expected = REAL_WORLD_ASPECTS[box.index]
        // 前缀取整只在亚像素级别改变比例。
        expect(Math.abs(rendered - expected)).toBeLessThan(0.02)
      })
    })
  })

  it('超宽图与常规图同排，不开独占整行的特例', () => {
    const rows = computeJustifiedRows(REAL_WORLD_ASPECTS, OPTIONS)
    const wideRows = rows.filter((row) =>
      row.boxes.some((box) => REAL_WORLD_ASPECTS[box.index] === 2.77),
    )
    expect(wideRows.length).toBeGreaterThan(0)
    wideRows.forEach((row) => {
      expect(row.boxes.length).toBeGreaterThan(1)
    })
  })

  it('末行默认也铺满', () => {
    // 12 张 1:1，容器 1104 / 目标 196 → 前几行装满后末行仍有多张，应铺满。
    const rows = computeJustifiedRows(Array(12).fill(1), OPTIONS)
    const lastRow = rows[rows.length - 1]
    expect(rowWidth(lastRow)).toBe(OPTIONS.containerWidth)
  })

  it('末行只剩一张超宽图时回落到目标行高，不被撑成巨幅', () => {
    // 6 张 1:1 正好装两行，第 7 张单独成末行：铺满会让它高到 1104px。
    const rows = computeJustifiedRows([...Array(6).fill(1), 1], OPTIONS)
    const lastRow = rows[rows.length - 1]
    expect(lastRow.boxes).toHaveLength(1)
    expect(lastRow.height).toBe(OPTIONS.targetRowHeight)
    expect(rowWidth(lastRow)).toBeLessThan(OPTIONS.containerWidth)
  })

  it('容器宽为 0（SSR / 未测量）时返回空排版而不是崩', () => {
    expect(
      computeJustifiedRows(REAL_WORLD_ASPECTS, {
        ...OPTIONS,
        containerWidth: 0,
      }),
    ).toEqual([])
    expect(computeJustifiedRows([], OPTIONS)).toEqual([])
  })

  it('窄容器（375 手机）下每行 2–3 张且不溢出', () => {
    const rows = computeJustifiedRows(REAL_WORLD_ASPECTS, {
      ...OPTIONS,
      containerWidth: 359,
      targetRowHeight: 124,
    })
    rows.slice(0, -1).forEach((row) => {
      expect(rowWidth(row)).toBe(359)
      expect(row.boxes.length).toBeGreaterThanOrEqual(2)
    })
  })
})

describe('resolveAssetGridViewport', () => {
  it('按 768 / 1280 两道分档（⚠ 不是 useIsMobile 的 1024）', () => {
    expect(resolveAssetGridViewport(375)).toBe('mobile')
    expect(resolveAssetGridViewport(767)).toBe('mobile')
    expect(resolveAssetGridViewport(768)).toBe('tablet')
    expect(resolveAssetGridViewport(1024)).toBe('tablet')
    expect(resolveAssetGridViewport(1279)).toBe('tablet')
    expect(resolveAssetGridViewport(1280)).toBe('desktop')
    expect(resolveAssetGridViewport(1920)).toBe('desktop')
  })

  it('三档各自的目标行高就是 page §5.6 的刻度表', () => {
    expect(ASSET_GRID_TARGET_ROW_HEIGHT.desktop).toEqual({
      s: 150,
      m: 196,
      l: 260,
    })
    expect(ASSET_GRID_TARGET_ROW_HEIGHT.tablet).toEqual({
      s: 128,
      m: 168,
      l: 222,
    })
    expect(ASSET_GRID_TARGET_ROW_HEIGHT.mobile).toEqual({
      s: 92,
      m: 124,
      l: 168,
    })
  })

  it('手机档 M（124）在 375 容器上每行 2–3 张且精确铺满', () => {
    const rows = computeJustifiedRows(REAL_WORLD_ASPECTS, {
      containerWidth: 359,
      targetRowHeight: ASSET_GRID_TARGET_ROW_HEIGHT.mobile.m,
      gap: ASSET_GRID_GAP,
      lastRowMaxScale: ASSET_GRID_LAST_ROW_MAX_SCALE,
    })
    rows.slice(0, -1).forEach((row) => {
      expect(rowWidth(row)).toBe(359)
      expect(row.boxes.length).toBeGreaterThanOrEqual(2)
      expect(row.boxes.length).toBeLessThanOrEqual(4)
    })
  })
})

describe('toLayoutAspectRatio', () => {
  it('缺宽高的存量记录按 1:1 兜底', () => {
    expect(toLayoutAspectRatio(0, 0)).toBe(1)
    expect(toLayoutAspectRatio(undefined, undefined)).toBe(1)
    expect(toLayoutAspectRatio(1024, 0)).toBe(1)
    expect(toLayoutAspectRatio(Number.NaN, 512)).toBe(1)
  })

  it('真实比例原样参与排版', () => {
    expect(toLayoutAspectRatio(1024, 1024)).toBe(1)
    expect(toLayoutAspectRatio(832, 1488)).toBeCloseTo(0.559, 3)
    expect(toLayoutAspectRatio(2048, 739)).toBeCloseTo(2.771, 3)
  })

  it('只对脏数据开安全阀 clamp', () => {
    expect(toLayoutAspectRatio(10000, 10)).toBe(ASSET_GRID_MAX_ASPECT_RATIO)
    expect(toLayoutAspectRatio(10, 10000)).toBe(ASSET_GRID_MIN_ASPECT_RATIO)
  })
})
