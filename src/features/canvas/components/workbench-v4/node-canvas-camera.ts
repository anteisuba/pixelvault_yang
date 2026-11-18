import type { Viewport } from '@xyflow/react'
import { animate } from 'motion/react'

import { DURATION, EASE_STANDARD } from '@/constants/motion'
import { NODE_STUDIO_CANVAS } from '@/constants/node-studio'

export interface CanvasCameraNode {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export interface CanvasCameraStage {
  readonly width: number
  readonly height: number
}

const NAME_LANE_PX = 22

function faceHeight(node: CanvasCameraNode, currentZoom: number): number {
  return Math.max(0, node.height - NAME_LANE_PX / currentZoom)
}

export function locateCanvasNode(
  stage: CanvasCameraStage,
  node: CanvasCameraNode,
  currentZoom: number,
  /** 安全区左界（`canvasShellSafeLeftPx`）。 */
  safeLeft: number,
): Viewport {
  const left = safeLeft
  const top = 64
  const right = stage.width - 16
  const bottom = stage.height - 76
  const availableWidth = right - left
  const availableHeight = bottom - top
  const height = faceHeight(node, currentZoom)

  let zoom = currentZoom
  if (node.width * zoom < 160) zoom = 1
  if (
    height * zoom + 170 > availableHeight ||
    node.width * zoom > availableWidth - 40
  ) {
    zoom = Math.min(
      zoom,
      (availableHeight - 170) / height,
      (availableWidth - 40) / node.width,
      1,
    )
  }

  const centerX = (left + right) / 2
  const centerY = top + (availableHeight - 170) / 2 + 30
  return {
    x: centerX - (node.x + node.width / 2) * zoom,
    y: centerY - (node.y + height / 2) * zoom - NAME_LANE_PX,
    zoom,
  }
}

/**
 * 「适应」的唯一算式：底栏「适应」、快捷键、打开项目时的自动适应、「回到内容」都调它。
 *
 * ⚠ 2026-11-18 之前三处三套参数：打开项目走这里（无下限、上限 100%）、底栏走 RF
 * `fitView`（下限 30%、上限 200%、padding 0.1）、快捷键走 `getViewportForBounds`
 * —— 同一张图打开是 13%、点「适应」变 30%。现在缩放夹在
 * [`NODE_STUDIO_CANVAS.minZoom`, `fitViewMaxZoom`]：超宽的图在 30% 放不下时，以
 * 内容中心居中，⛔ 不再缩到手动缩放够不着的档位。
 */
export function fitCanvasProject(
  stage: CanvasCameraStage,
  nodes: readonly CanvasCameraNode[],
  currentZoom: number,
): Viewport {
  if (nodes.length === 0) {
    return { x: stage.width / 2, y: stage.height / 2, zoom: 1 }
  }

  const minX = Math.min(...nodes.map((node) => node.x))
  const maxX = Math.max(...nodes.map((node) => node.x + node.width))
  const minY = Math.min(...nodes.map((node) => node.y))
  const maxY = Math.max(
    ...nodes.map((node) => node.y + faceHeight(node, currentZoom)),
  )
  const zoom = Math.max(
    NODE_STUDIO_CANVAS.minZoom,
    Math.min(
      NODE_STUDIO_CANVAS.fitViewMaxZoom,
      (stage.width - 200) / (maxX - minX),
      (stage.height - 200) / (maxY - minY + 24),
    ),
  )
  return {
    x: stage.width / 2 - ((minX + maxX) / 2) * zoom,
    y: stage.height / 2 - ((minY + maxY) / 2) * zoom + 12 * zoom - 22,
    zoom,
  }
}

/**
 * 画布上有卡、但一张都不在视口里 = 用户把内容「丢」了（平移 / 缩放出去了）——这时
 * 出「回到内容」。判据是卡的屏幕矩形与画布区域有没有交集（贴边一像素也算看得见）。
 * 空画布不算丢：那是另一个状态（空画布引导）。
 */
export function isCanvasContentLost(
  stage: CanvasCameraStage,
  viewport: Viewport,
  nodes: readonly CanvasCameraNode[],
): boolean {
  if (nodes.length === 0 || stage.width <= 0 || stage.height <= 0) return false
  return !nodes.some((node) => {
    const left = viewport.x + node.x * viewport.zoom
    const top = viewport.y + node.y * viewport.zoom
    const right = left + node.width * viewport.zoom
    const bottom = top + node.height * viewport.zoom
    return (
      right >= 0 && left <= stage.width && bottom >= 0 && top <= stage.height
    )
  })
}

/** 屏幕（画布容器局部）上的一块区域。 */
export interface CanvasScreenArea {
  readonly left: number
  readonly top: number
  readonly right: number
  readonly bottom: number
}

/**
 * 画布里**真正看得见**的那一块：左扣开着的面板（`safeLeft`）、上扣顶栏、下扣底栏、
 * 右扣边距 —— 与 `locateCanvasNode` / `layoutNodeChrome` 同一组边距。助手推开画布时
 * 画布容器本身变窄（`stage` 已经扣掉），这里不再另扣。
 */
export function canvasVisibleScreenArea(
  stage: CanvasCameraStage,
  safeLeft: number,
): CanvasScreenArea {
  return {
    left: safeLeft,
    top: 64,
    right: stage.width - 16,
    bottom: stage.height - 76,
  }
}

/** 右下小地图（展开态 194×128，贴边 16，再留 12 的缝）挡住的那一块。 */
export function canvasMinimapScreenRect(
  stage: CanvasCameraStage,
): CanvasCameraNode {
  const width = 16 + 194 + 12
  const height = 16 + 128 + 12
  return {
    x: stage.width - width,
    y: stage.height - height,
    width,
    height,
  }
}

/**
 * 新卡选中后贴着它长出来的浮层要占的屏幕高度（浮层恒 1 倍，⛔ 不跟缩放）：上 = 卡名行
 * 22 + 缝 8 + 工具条约 44；下 = 缝 10 + 提示词栏约 140（收起态实测量级，取大不取小）。
 */
export const NEW_CARD_CHROME_RESERVE_PX = { top: 74, bottom: 150 } as const

export function screenAreaToFlow(
  area: CanvasScreenArea,
  viewport: Viewport,
): CanvasScreenArea {
  return {
    left: (area.left - viewport.x) / viewport.zoom,
    top: (area.top - viewport.y) / viewport.zoom,
    right: (area.right - viewport.x) / viewport.zoom,
    bottom: (area.bottom - viewport.y) / viewport.zoom,
  }
}

export function screenRectToFlow(
  rect: CanvasCameraNode,
  viewport: Viewport,
): CanvasCameraNode {
  return {
    x: (rect.x - viewport.x) / viewport.zoom,
    y: (rect.y - viewport.y) / viewport.zoom,
    width: rect.width / viewport.zoom,
    height: rect.height / viewport.zoom,
  }
}

/**
 * 把一块画布矩形（新卡 + 上下浮层的占位）**平移**进可见区：缩放不动，只挪最少的距离；
 * 已经整块可见 = 原样返回同一个视口。比可见区还大时对齐左上。
 */
export function revealFlowRect(
  area: CanvasScreenArea,
  viewport: Viewport,
  rect: CanvasCameraNode,
): Viewport {
  const { zoom } = viewport
  const shift = (start: number, end: number, min: number, max: number) => {
    if (end - start > max - min || start < min) return min - start
    if (end > max) return max - end
    return 0
  }
  const left = viewport.x + rect.x * zoom
  const top = viewport.y + rect.y * zoom
  const dx = shift(left, left + rect.width * zoom, area.left, area.right)
  const dy = shift(top, top + rect.height * zoom, area.top, area.bottom)
  if (dx === 0 && dy === 0) return viewport
  return { x: viewport.x + dx, y: viewport.y + dy, zoom }
}

/** 一块画布矩形是否整块落在可见区里（测试与调用方共用的判据）。 */
export function isFlowRectVisible(
  area: CanvasScreenArea,
  viewport: Viewport,
  rect: CanvasCameraNode,
): boolean {
  return revealFlowRect(area, viewport, rect) === viewport
}

export function animateCanvasMove(
  from: Viewport,
  target: Viewport,
  onUpdate: (viewport: Viewport) => void,
  onComplete: () => void,
): { stop(): void } {
  return animate(0, 1, {
    duration: DURATION.slow,
    ease: EASE_STANDARD,
    onUpdate: (progress) => {
      onUpdate({
        x: from.x + (target.x - from.x) * progress,
        y: from.y + (target.y - from.y) * progress,
        zoom: from.zoom + (target.zoom - from.zoom) * progress,
      })
    },
    onComplete: () => {
      onUpdate(target)
      onComplete()
    },
  })
}
