'use client'

/**
 * 手动加卡（底栏「+」面板 / ⌘K / 键盘 T·I·A·V / 双击 / 右键）的**落点 + 选中 + 镜头**。
 *
 * owner 2026-11-18 真机：从「+」面板连加两张，第二张找空位一路往下找，落到底栏后面、
 * 视口外——只看得见卡名，提示词栏被夹没了，连是不是选中都判断不了。所以三步：
 *
 * ① **先在看得见的那一块里找空位**（`canvasVisibleScreenArea`：扣开着的左侧面板、
 *    顶栏、底栏，再躲开右下小地图），卡**连同**选中后贴着它长出来的工具条 / 提示词栏
 *    （`NEW_CARD_CHROME_RESERVE_PX`）都得落在里面；
 * ② 一屏里实在没地方 → 退回 `placeNearPoint` 往外放，**再把镜头平移**到整块看得见
 *    （缩放不动）；
 * ③ 落下即选中：新节点要等它进了 `graph.nodes` 的下一次提交才选得上（同一个事件里选
 *    会被派生那一步覆盖成未选），所以记一个待选 id，effect 里落。
 *
 * ⚠ 只算坐标、只发一条 `addNode`，⛔ 不另起写入路径（op 表仍是唯一语义写入口）。
 */

import { useCallback, useEffect, useRef } from 'react'
import type { Viewport, XYPosition } from '@xyflow/react'

import {
  getCanvasAddCatalogItem,
  type CanvasAddIntentId,
} from '@/constants/canvas-add-catalog'
import { estimateCardSize, placeInArea } from '@/lib/node-flow-layout'

import type { NodeGraphV4 } from '@/features/canvas/hooks/use-node-graph-v4'

import {
  canvasMinimapScreenRect,
  canvasVisibleScreenArea,
  NEW_CARD_CHROME_RESERVE_PX,
  revealFlowRect,
  screenAreaToFlow,
  screenRectToFlow,
  type CanvasCameraStage,
} from './node-canvas-camera'

/** 找空位的网格步长（屏幕像素，换算成画布单位再用）。 */
const SEARCH_STEP_PX = 24

export interface UseCanvasAddInViewOptions {
  readonly graph: NodeGraphV4
  /** 画布容器尺寸；还没量到 = `null`（退回只避让不看视口）。 */
  readStage(): CanvasCameraStage | null
  getViewport(): Viewport
  /** 安全区左界（`canvasShellSafeLeftPx`，左侧面板开着时更靠右）。 */
  readonly safeLeftPx: number
  /** 新卡落在一屏之外时，把镜头挪到这个视口（调用方决定要不要动画）。 */
  revealViewport(target: Viewport): void
}

export interface CanvasAddInView {
  /**
   * 按意图建一张卡。`preferred` = 想落的左上角（画布坐标；双击 / 右键的点），不给 =
   * 可见区中央。返回新卡 id（没建成 = `null`）。
   */
  addIntent(intentId: CanvasAddIntentId, preferred?: XYPosition): string | null
  /** 下一次提交里单选它（左栏落角色等别的落卡路共用）。 */
  selectWhenReady(nodeId: string): void
}

export function useCanvasAddInView({
  graph,
  readStage,
  getViewport,
  safeLeftPx,
  revealViewport,
}: UseCanvasAddInViewOptions): CanvasAddInView {
  const pendingSelectRef = useRef<string | null>(null)

  const selectWhenReady = useCallback((nodeId: string) => {
    pendingSelectRef.current = nodeId
  }, [])

  const addIntent = useCallback(
    (intentId: CanvasAddIntentId, preferred?: XYPosition) => {
      const item = getCanvasAddCatalogItem(intentId)
      const size = estimateCardSize({ data: item.v4 })
      const stage = readStage()
      let position: XYPosition | undefined
      let reveal: Viewport | null = null
      if (stage) {
        const viewport = getViewport()
        const screen = canvasVisibleScreenArea(stage, safeLeftPx)
        const area = screenAreaToFlow(screen, viewport)
        const padTop = NEW_CARD_CHROME_RESERVE_PX.top / viewport.zoom
        const padBottom = NEW_CARD_CHROME_RESERVE_PX.bottom / viewport.zoom
        // 不给点 = 卡连同上下浮层整块居中在可见区里。
        const want = preferred ?? {
          x: (area.left + area.right) / 2 - size.width / 2,
          y:
            (area.top + padTop + area.bottom - padBottom) / 2 - size.height / 2,
        }
        const inView = placeInArea(graph.occupiedRects(), want, size, area, {
          padTop,
          padBottom,
          avoid: [screenRectToFlow(canvasMinimapScreenRect(stage), viewport)],
          step: SEARCH_STEP_PX / viewport.zoom,
        })
        position = inView ?? graph.placeNear(want, [item.v4])[0]
        if (!inView && position) {
          const target = revealFlowRect(screen, viewport, {
            x: position.x,
            y: position.y - padTop,
            width: size.width,
            height: size.height + padTop + padBottom,
          })
          if (target !== viewport) reveal = target
        }
      } else if (preferred) {
        position = graph.placeNear(preferred, [item.v4])[0]
      }
      const nodeId = graph.addNode(item.v4.kind, item.v4.subtype, {
        ...(position ? { position } : {}),
      })
      if (!nodeId) return null
      pendingSelectRef.current = nodeId
      if (reveal) revealViewport(reveal)
      return nodeId
    },
    [getViewport, graph, readStage, revealViewport, safeLeftPx],
  )

  useEffect(() => {
    const id = pendingSelectRef.current
    if (!id || !graph.nodes.some((node) => node.id === id)) return
    pendingSelectRef.current = null
    graph.onRfNodesChange([
      ...graph.selectedNodeIds
        .filter((selected) => selected !== id)
        .map((selected) => ({
          id: selected,
          type: 'select' as const,
          selected: false,
        })),
      { id, type: 'select', selected: true },
    ])
  }, [graph])

  return { addIntent, selectWhenReady }
}
