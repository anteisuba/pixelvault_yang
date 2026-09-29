import type { Viewport } from '@xyflow/react'
import { animate } from 'motion/react'

import { DURATION, EASE_STANDARD } from '@/constants/motion'

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
  sidebarOpen: boolean,
): Viewport {
  const left = sidebarOpen ? 346 : 72
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
  const zoom = Math.min(
    1,
    (stage.width - 200) / (maxX - minX),
    (stage.height - 200) / (maxY - minY + 24),
  )
  return {
    x: stage.width / 2 - ((minX + maxX) / 2) * zoom,
    y: stage.height / 2 - ((minY + maxY) / 2) * zoom + 12 * zoom - 22,
    zoom,
  }
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
