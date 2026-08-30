'use client'

import { useCallback, useEffect, useState } from 'react'
import { Position, useReactFlow, useStore } from '@xyflow/react'

import { NODE_STUDIO_NODE_SIDECAR_OFFSET } from '@/constants/node-studio'

/**
 * 节点侧车（编排台 / 生成框）的**视口避让**——台账 N（owner 2026-08-29 真机，
 * 标 ⭐）。
 *
 * ── 修的是什么 ──────────────────────────────────────────────────────
 * 两条侧车（`GenerateComposer` 的生成框、`SeedanceNode` 的视频编排台）都写死
 * `position={Position.Right}` + `align="start"`。`NodeToolbar` 自己**不做**任何
 * 边缘检测，于是：
 *   · 宿主卡靠近视口右缘 → 模型/规格/发送那一整行落在屏幕外；
 *   · 提示词写长把面板撑高、宿主卡靠近下缘 → 发送键掉到屏幕外。
 * 面板既不翻到左边，也不把自己滚进视野。owner 实测唯一的出路是**把节点拖到屏幕
 * 中间再操作** —— 一轮里拖了三次节点、缩放了四次画布。
 *
 * ── 判据 ────────────────────────────────────────────────────────────
 * 只在**放不下时**才翻，能放下就一像素不动（既有几何是 owner 多轮真机验过的）：
 *   · 右边放不下且左边放得下 → 翻到左侧；两边都放不下 → 留在右侧（翻过去只是
 *     换一边被裁，还平白让面板跳位）。
 *   · 下方放不下且上方放得下 → `align` 从 `start` 改成 `end`（面板底边对齐宿主
 *     卡底边，向上生长）。
 *
 * ── 为什么要订阅 transform ──────────────────────────────────────────
 * 平移/缩放会改变宿主卡的屏幕位置，而 `NodeToolbar` 会跟着动 —— 判据必须跟着
 * 重算，否则用户缩放一下就又被裁了。`useStore` 订阅的是 ReactFlow 自己的
 * transform，不另起一套 rAF 轮询。
 */
export interface SidecarPlacement {
  position: Position.Left | Position.Right
  align: 'start' | 'end'
}

const DEFAULT_PLACEMENT: SidecarPlacement = {
  position: Position.Right,
  align: 'start',
}

export function useSidecarPlacement(
  nodeId: string | null | undefined,
  /** 侧车面板的根元素 —— 用它的实测尺寸判断放不放得下。 */
  panel: HTMLElement | null,
  enabled: boolean,
): SidecarPlacement {
  const { getNode, flowToScreenPosition } = useReactFlow()
  // 平移/缩放都会改宿主卡的屏幕位置；订阅 transform 让判据跟着重算。
  const transform = useStore((state) => state.transform)
  const [placement, setPlacement] =
    useState<SidecarPlacement>(DEFAULT_PLACEMENT)

  const measure = useCallback((): SidecarPlacement => {
    if (!enabled || !nodeId || !panel) return DEFAULT_PLACEMENT
    const node = getNode(nodeId)
    if (!node) return DEFAULT_PLACEMENT

    const zoom = transform[2]
    const topLeft = flowToScreenPosition(node.position)
    const nodeWidth = (node.measured?.width ?? 0) * zoom
    const nodeHeight = (node.measured?.height ?? 0) * zoom
    // 面板不随画布缩放（`NodeToolbar` 的 offset 是屏幕像素，面板本身也是），
    // 所以这里量到的就是它在屏幕上的真实尺寸。
    const panelRect = panel.getBoundingClientRect()
    const gap = NODE_STUDIO_NODE_SIDECAR_OFFSET.desktop

    const fitsRight =
      topLeft.x + nodeWidth + gap + panelRect.width <= window.innerWidth
    const fitsLeft = topLeft.x - gap - panelRect.width >= 0
    const fitsBelow = topLeft.y + panelRect.height <= window.innerHeight
    const fitsAbove = topLeft.y + nodeHeight - panelRect.height >= 0

    return {
      // 两边都放不下就留在右侧：翻过去只是换一边被裁，还平白让面板跳一次位。
      position: !fitsRight && fitsLeft ? Position.Left : Position.Right,
      align: !fitsBelow && fitsAbove ? 'end' : 'start',
    }
  }, [enabled, flowToScreenPosition, getNode, nodeId, panel, transform])

  useEffect(() => {
    const apply = () => {
      const next = measure()
      setPlacement((current) =>
        current.position === next.position && current.align === next.align
          ? current
          : next,
      )
    }
    apply()
    if (!enabled || !panel) return

    // 面板自己会长高（提示词换行、素材槽增减）——尺寸变了要重判，不能只在
    // 挂载时算一次。
    const observer = new ResizeObserver(apply)
    observer.observe(panel)
    window.addEventListener('resize', apply)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', apply)
    }
  }, [enabled, measure, panel])

  return placement
}
