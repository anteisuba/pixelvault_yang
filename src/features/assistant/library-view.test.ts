import { describe, expect, it } from 'vitest'

import {
  renderLibraryView,
  screenRows,
} from '@/features/assistant/library-view'

/**
 * 11-17 真机：素材库开着问「最近那张粉头发女孩在窗边看书的图是哪个模型出的」，图就在屏上
 * 第 4 行，助手回「没找到」—— 板子上屏上那几格只有编号，模型没法拿描述去对号。
 */
describe('库开着：屏上每格一行摘要', () => {
  const tiles = [
    // 第 1 排两格（上沿错开一点也算同一排）。
    {
      box: [0, 0, 0.2, 0.2] as [number, number, number, number],
      about: { type: 'image', model: 'sdxl', at: '2026-11-10 08:00' },
    },
    {
      box: [0.25, 0.01, 0.2, 0.2] as [number, number, number, number],
      about: { type: 'image', model: 'flux-2-pro', text: 'a red car' },
    },
    // 第 2 排。
    {
      box: [0, 0.3, 0.2, 0.2] as [number, number, number, number],
      about: {
        type: 'image',
        model: 'nano-banana-pro',
        at: '2026-11-15 09:30',
        text: 'pink hair girl reading a book by the window',
      },
    },
  ]

  it('一格一行：编号 · 第几排 · 类型 · 模型 · 时间 · 提示词前若干字', () => {
    const line = renderLibraryView({
      library: 'assets',
      screen: {
        kind: 'picture',
        scope: 'all their assets',
        total: 1500,
        visible: ['图_0001', '图_0002', '图_0412'],
        tiles,
        viewport: { width: 1000, height: 800 },
      },
    })
    expect(line).toContain(
      '3 图_0412 — screen row 2 · image · nano-banana-pro · 2026-11-15 09:30 · "pink hair girl reading a book by the window"',
    )
    expect(line).toContain('1 图_0001 — screen row 1 · image · sdxl')
    expect(line).toContain('(1500 in all)')
    // 先在这几行里对号，⛔ 没对过就说没有。
    expect(line).toContain('match it against these lines first')
  })

  it('没有摘要（旧页面 / 音色）：照旧一行编号，不出对号那句', () => {
    const line = renderLibraryView({
      library: 'voices',
      screen: { kind: 'voice', visible: ['Aemeath'], tiles: [{}] },
    })
    expect(line).toContain('1 音色·Aemeath')
    expect(line).not.toContain('match it against these lines')
  })

  it('排号：按上沿聚排，没位置的那一格不编排', () => {
    expect(screenRows([...tiles, {}])).toEqual([1, 1, 2, undefined])
    expect(screenRows(undefined)).toEqual([])
  })
})
