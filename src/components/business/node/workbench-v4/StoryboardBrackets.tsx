'use client'

/**
 * 九宫格切出来的一组卡，左边一道浅括号（node-canvas-v2 §3「九宫格分镜」A）。
 *
 * ⛔ 不连线：九根线会把画布缠成一团。组号写在每张卡的 `storyboardCell` 上，这里按组
 * 取当前位置与实测尺寸，在画布坐标里画 —— 卡被拖动时括号跟着走；组里只剩一张就不画。
 */

import { useMemo } from 'react'
import { ViewportPortal, useNodes } from '@xyflow/react'

import { NODE_MEDIA_KIND_IDS } from '@/constants/node-types'
import { STORYBOARD_BRACKET } from '@/constants/storyboard-grid'
import type { NodeV4 } from '@/types/node-workflow'

import { collapsedImageHeight } from '../nodes/v4/image/image-node-model'

interface Bracket {
  readonly groupId: string
  readonly x: number
  readonly y: number
  readonly height: number
}

export function StoryboardBrackets({ nodes }: { nodes: readonly NodeV4[] }) {
  const flowNodes = useNodes()
  const brackets = useMemo<Bracket[]>(() => {
    const measured = new Map(
      flowNodes.map((node) => [node.id, node.measured] as const),
    )
    const groups = new Map<
      string,
      { minX: number; minY: number; maxY: number; count: number }
    >()
    for (const node of nodes) {
      if (node.data.kind !== NODE_MEDIA_KIND_IDS.image) continue
      const cell = node.data.storyboardCell
      if (!cell) continue
      const size = measured.get(node.id)
      const height = size?.height ?? collapsedImageHeight(node.data)
      const group = groups.get(cell.groupId)
      if (group) {
        group.minX = Math.min(group.minX, node.position.x)
        group.minY = Math.min(group.minY, node.position.y)
        group.maxY = Math.max(group.maxY, node.position.y + height)
        group.count += 1
      } else {
        groups.set(cell.groupId, {
          minX: node.position.x,
          minY: node.position.y,
          maxY: node.position.y + height,
          count: 1,
        })
      }
    }
    return [...groups.entries()]
      .filter(([, group]) => group.count > 1)
      .map(([groupId, group]) => ({
        groupId,
        x: group.minX - STORYBOARD_BRACKET.offset - STORYBOARD_BRACKET.width,
        y: group.minY,
        height: group.maxY - group.minY,
      }))
  }, [nodes, flowNodes])

  if (brackets.length === 0) return null
  return (
    <ViewportPortal>
      {brackets.map((bracket) => (
        <div
          key={bracket.groupId}
          aria-hidden
          data-storyboard-bracket={bracket.groupId}
          className="pointer-events-none absolute rounded-l-xl border-y border-l border-foreground/25 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:delay-500 motion-safe:duration-fast motion-safe:fill-mode-backwards"
          style={{
            transform: `translate(${bracket.x}px, ${bracket.y}px)`,
            width: STORYBOARD_BRACKET.width,
            height: bracket.height,
          }}
        />
      ))}
    </ViewportPortal>
  )
}
