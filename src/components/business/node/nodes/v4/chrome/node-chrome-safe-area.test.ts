import { describe, expect, it } from 'vitest'

import { canvasShellSafeLeftPx } from '@/constants/canvas-shell'

import {
  layoutNodeChrome,
  type NodeChromeLayoutInput,
} from './node-chrome-safe-area'

const base: NodeChromeLayoutInput = {
  viewport: { width: 1440, height: 900 },
  card: { x: 500, y: 300, width: 320, height: 180 },
  zoom: 1,
  safeLeft: 72,
  content: { width: 640, height: 100 },
  position: 'bottom',
}

describe('节点浮层安全区 · mock.html after', () => {
  it('以 React Flow 局部坐标夹位；画布局部 x=72 对应截图 x=129', () => {
    const layout = layoutNodeChrome({
      ...base,
      viewport: { width: 1383, height: 900 },
      card: { x: 79.09, y: 298.88, width: 286.65, height: 161.24 },
      zoom: 0.9,
    })
    expect(layout.left).toBe(72)
    expect(57 + layout.left).toBe(129)
    expect(layout.top).toBeCloseTo(470.12)
    expect(layout.scale).toBe(0.9)
  })

  it('侧栏打开时左界改为 346，缩放仍按 0.6–1', () => {
    const closed = layoutNodeChrome({ ...base, card: { ...base.card, x: 0 } })
    const opened = layoutNodeChrome({
      ...base,
      card: { ...base.card, x: 0 },
      safeLeft: 346,
    })
    expect(closed.left).toBe(72)
    expect(opened.left).toBe(346)
    expect(layoutNodeChrome({ ...base, zoom: 0.3 }).scale).toBe(0.6)
    expect(layoutNodeChrome({ ...base, zoom: 1.5 }).scale).toBe(1)
  })

  it('缩放后的实际栏高决定下界，左/右夹位也使用缩放后的宽度', () => {
    const bottom = layoutNodeChrome({
      ...base,
      card: { x: 500, y: 790, width: 100, height: 50 },
      zoom: 0.6,
      content: { width: 300, height: 100 },
    })
    const right = layoutNodeChrome({
      ...base,
      card: { x: 1300, y: 300, width: 100, height: 50 },
      zoom: 0.6,
      content: { width: 300, height: 100 },
    })
    expect(bottom.top).toBe(764)
    expect(right.left).toBe(1244)
  })

  it('顶部先留卡名 22 和空隙 8，再夹在上界 64；底部夹在 H−76', () => {
    const top = layoutNodeChrome({
      ...base,
      position: 'top',
      card: { ...base.card, y: 80 },
      content: { width: 200, height: 40 },
    })
    expect(top.top).toBe(64)
    expect(top.originY).toBe('100%')

    const bottom = layoutNodeChrome({
      ...base,
      card: { ...base.card, y: 790 },
    })
    expect(bottom.top).toBe(724)
    expect(bottom.originY).toBe('0')
  })

  it('右边夹位与左边独立，动画原点仍对准卡中心', () => {
    const layout = layoutNodeChrome({
      ...base,
      card: { x: 1300, y: 300, width: 100, height: 180 },
      content: { width: 300, height: 100 },
    })
    expect(layout.left).toBe(1124)
    expect(layout.originX).toBe(226)
  })

  it('仅当提示词栏同时碰到小地图上缘与左缘，才向左绕开', () => {
    const card = { x: 1300, y: 700, width: 100, height: 50 }
    const around = layoutNodeChrome({
      ...base,
      card,
      content: { width: 420, height: 100 },
    })
    expect(around.top).toBe(724)
    expect(around.left).toBe(798)

    expect(
      layoutNodeChrome({
        ...base,
        card: { ...card, y: 400 },
        content: { width: 420, height: 100 },
      }).left,
    ).toBe(1004)
    expect(
      layoutNodeChrome({
        ...base,
        card: { ...card, x: 700 },
        content: { width: 420, height: 100 },
      }).left,
    ).toBe(540)
  })

  it('整张卡离开安全区才隐藏；恰好贴边仍显示', () => {
    const outside = layoutNodeChrome({
      ...base,
      card: { x: -300, y: 300, width: 300, height: 100 },
    })
    const touching = layoutNodeChrome({
      ...base,
      card: { x: -228, y: 300, width: 300, height: 100 },
    })
    expect(outside.visible).toBe(false)
    expect(touching.visible).toBe(true)
    expect(layoutNodeChrome(base).visible).toBe(true)
    expect(
      layoutNodeChrome({
        ...base,
        card: { x: 300, y: 825, width: 100, height: 100 },
      }).visible,
    ).toBe(false)
  })

  it('栏高改变会重新推回下界，小地图绕行使用新的栏高', () => {
    const card = { x: 1300, y: 650, width: 100, height: 50 }
    const short = layoutNodeChrome({
      ...base,
      card,
      content: { width: 420, height: 20 },
    })
    const tall = layoutNodeChrome({
      ...base,
      card,
      content: { width: 420, height: 120 },
    })
    expect(short.left).toBe(1004)
    expect(tall.left).toBe(798)
    expect(tall.top).toBe(704)
  })
})

describe('canvasShellSafeLeftPx · 图标栏并进全站侧栏（owner 2026-10-08）', () => {
  it('≥1024 画布里没有图标栏：收着只留边距，面板开着让出面板', () => {
    expect(
      canvasShellSafeLeftPx({ panelOpen: false, railVisible: false }),
    ).toBe(16)
    expect(canvasShellSafeLeftPx({ panelOpen: true, railVisible: false })).toBe(
      294,
    )
  })

  it('768–1023 图标栏仍在画布里：沿用 72 / 346', () => {
    expect(canvasShellSafeLeftPx({ panelOpen: false, railVisible: true })).toBe(
      72,
    )
    expect(canvasShellSafeLeftPx({ panelOpen: true, railVisible: true })).toBe(
      346,
    )
  })
})
