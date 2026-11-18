import { act, renderHook } from '@testing-library/react'
import type { Viewport } from '@xyflow/react'
import { describe, expect, it, vi } from 'vitest'

import {
  CANVAS_ADD_INTENT_IDS,
  getCanvasAddCatalogItem,
} from '@/constants/canvas-add-catalog'
import { canvasShellSafeLeftPx } from '@/constants/canvas-shell'
import { estimateCardSize } from '@/lib/node-flow-layout'
import type {
  NodeV4,
  NodeV4Data,
  NodeWorkflowStateV4,
} from '@/types/node-workflow'

import { useNodeGraphV4 } from '@/features/canvas/hooks/use-node-graph-v4'

import {
  canvasVisibleScreenArea,
  isFlowRectVisible,
  NEW_CARD_CHROME_RESERVE_PX,
  revealFlowRect,
  type CanvasCameraStage,
} from './node-canvas-camera'
import { useCanvasAddInView } from './use-canvas-add-in-view'

/**
 * owner 2026-11-18 真机复验：1540×784、缩放 68%、左侧「添加节点」面板开着，从「+」
 * 连加「备注」「镜头」—— 第二张落到底栏后面、视口外，看不到提示词栏、判断不了选没选中。
 */

const NOW = '2026-11-18T00:00:00.000Z'
const STAGE: CanvasCameraStage = { width: 1540, height: 784 }
const SAFE_LEFT = canvasShellSafeLeftPx({ panelOpen: true })

function card(id: string, x: number, y: number, subtype = 'shot'): NodeV4 {
  return {
    id,
    position: { x, y },
    data: {
      kind: 'image',
      subtype,
      name: id,
      status: 'idle',
      createdAt: NOW,
    } as NodeV4Data,
  }
}

function setup(nodes: readonly NodeV4[], viewport: Viewport) {
  const revealViewport = vi.fn()
  let current: Viewport = viewport
  const view = renderHook(
    ({ state }: { state: NodeWorkflowStateV4 }) => {
      const graph = useNodeGraphV4({
        state,
        onStateChange: (next) => view.rerender({ state: next }),
      })
      const add = useCanvasAddInView({
        graph,
        readStage: () => STAGE,
        getViewport: () => current,
        safeLeftPx: SAFE_LEFT,
        revealViewport: (target) => {
          current = target
          revealViewport(target)
        },
      })
      return { graph, add }
    },
    { initialProps: { state: { version: 4, nodes: [...nodes], edges: [] } } },
  )
  return { view, revealViewport, viewportNow: () => current }
}

/** 新卡连同选中后上下长出来的工具条 / 提示词栏（画布单位）。 */
function footprintOf(node: NodeV4, zoom: number) {
  const size = estimateCardSize(node)
  const padTop = NEW_CARD_CHROME_RESERVE_PX.top / zoom
  const padBottom = NEW_CARD_CHROME_RESERVE_PX.bottom / zoom
  return {
    x: node.position.x,
    y: node.position.y - padTop,
    width: size.width,
    height: size.height + padTop + padBottom,
  }
}

function overlaps(a: NodeV4, b: NodeV4): boolean {
  const sa = estimateCardSize(a)
  const sb = estimateCardSize(b)
  return (
    a.position.x < b.position.x + sb.width &&
    b.position.x < a.position.x + sa.width &&
    a.position.y < b.position.y + sb.height &&
    b.position.y < a.position.y + sa.height
  )
}

describe('useCanvasAddInView · 加卡落在看得见的地方并选中', () => {
  it('68% · 面板开着 · 中间有卡：连加「备注」「镜头」，每张加完都选中、连同提示词栏整块在可见区里', () => {
    const viewport: Viewport = { x: -200, y: -80, zoom: 0.68 }
    // 四张横排 + 中间一堆叠在同一点的卡（真机测试项目的形状）。
    const existing = [
      card('row1', 700, 100),
      card('row2', 1100, 100),
      card('row3', 1500, 100),
      card('row4', 1900, 100),
      card('stack1', 1200, 700, 'reference'),
      card('stack2', 1200, 700, 'character'),
      card('stack3', 1200, 700, 'background'),
    ]
    const { view, revealViewport } = setup(existing, viewport)
    const area = canvasVisibleScreenArea(STAGE, SAFE_LEFT)

    for (const intent of [
      CANVAS_ADD_INTENT_IDS.textNote,
      CANVAS_ADD_INTENT_IDS.videoShot,
    ]) {
      let id: string | null = null
      act(() => {
        id = view.result.current.add.addIntent(intent)
      })
      expect(id).not.toBeNull()
      const graph = view.result.current.graph
      expect(graph.selectedNodeIds).toEqual([id])
      const created = graph.nodes.find((node) => node.id === id)
      expect(created).toBeDefined()
      if (!created) return
      expect(created.data.kind).toBe(getCanvasAddCatalogItem(intent).v4.kind)
      expect(
        isFlowRectVisible(area, viewport, footprintOf(created, 0.68)),
      ).toBe(true)
      for (const other of graph.nodes) {
        if (other.id !== created.id)
          expect(overlaps(created, other)).toBe(false)
      }
    }
    // 一屏里放得下 = 镜头不动。
    expect(revealViewport).not.toHaveBeenCalled()
  })

  it('一屏里铺满了：往外放，并把镜头平移到整张卡连同提示词栏都看得见；仍然选中', () => {
    const viewport: Viewport = { x: 0, y: 0, zoom: 1 }
    const tiles: NodeV4[] = []
    for (let x = -400; x <= 1900; x += 320) {
      for (let y = -200; y <= 1000; y += 200)
        tiles.push(card(`t${x}_${y}`, x, y))
    }
    const { view, revealViewport, viewportNow } = setup(tiles, viewport)
    let id: string | null = null
    act(() => {
      id = view.result.current.add.addIntent(CANVAS_ADD_INTENT_IDS.imageShot)
    })
    const graph = view.result.current.graph
    expect(graph.selectedNodeIds).toEqual([id])
    const created = graph.nodes.find((node) => node.id === id)
    if (!created) throw new Error('没建出来')
    for (const other of graph.nodes) {
      if (other.id !== created.id) expect(overlaps(created, other)).toBe(false)
    }
    expect(revealViewport).toHaveBeenCalledTimes(1)
    const area = canvasVisibleScreenArea(STAGE, SAFE_LEFT)
    expect(isFlowRectVisible(area, viewport, footprintOf(created, 1))).toBe(
      false,
    )
    expect(
      isFlowRectVisible(area, viewportNow(), footprintOf(created, 1)),
    ).toBe(true)
    expect(viewportNow().zoom).toBe(1)
  })

  it('双击指的点空着 = 就落在那一点', () => {
    const viewport: Viewport = { x: 0, y: 0, zoom: 1 }
    const { view } = setup([card('far', 3000, 3000)], viewport)
    let id: string | null = null
    act(() => {
      id = view.result.current.add.addIntent(CANVAS_ADD_INTENT_IDS.imageShot, {
        x: 500,
        y: 200,
      })
    })
    const created = view.result.current.graph.nodes.find(
      (node) => node.id === id,
    )
    expect(created?.position).toEqual({ x: 500, y: 200 })
    expect(view.result.current.graph.selectedNodeIds).toEqual([id])
  })
})

describe('revealFlowRect', () => {
  const area = { left: 100, top: 64, right: 1000, bottom: 700 }
  it('已经整块可见 = 原样返回同一个视口', () => {
    const viewport = { x: 0, y: 0, zoom: 1 }
    expect(
      revealFlowRect(area, viewport, {
        x: 200,
        y: 100,
        width: 100,
        height: 100,
      }),
    ).toBe(viewport)
  })
  it('压在底边下 = 只往上挪刚好够的距离，缩放不动', () => {
    const viewport = { x: 0, y: 0, zoom: 0.5 }
    const next = revealFlowRect(area, viewport, {
      x: 400,
      y: 1300,
      width: 200,
      height: 200,
    })
    expect(next).toEqual({ x: 0, y: 700 - 1500 * 0.5, zoom: 0.5 })
  })
})
