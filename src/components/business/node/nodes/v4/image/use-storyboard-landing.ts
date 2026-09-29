'use client'

import { useLayoutEffect, type RefObject } from 'react'

import type { StoryboardLanding } from '@/hooks/node/use-storyboard-grid-split'
import type { NodeV4 } from '@/types/node-workflow'

import { collapsedImageHeight, collapsedImageWidth } from './image-node-model'

/** 切开后多久之内挂上的格子还算「刚落下」（之后重挂不再重播）。 */
const LANDING_WINDOW_MS = 2000
/** 按格子序号错开（设计画布「九宫格 · 动效表」A：错开 30）。 */
const STAGGER_MS = 30

function cssVar(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim()
  return value || fallback
}

/**
 * 九宫格切开后，这一格从原图上**它自己那一格**的位置飞到落点（位移 + 从格子的大小
 * 放大到卡的大小），走画布卡的 slot 弹簧；减少动态效果下只淡入。
 * ⚠ 在画布坐标里算：卡片的 DOM 在 ReactFlow 的视口变换里，位移按画布单位给即可。
 */
export function useStoryboardLanding(
  ref: RefObject<HTMLElement | null>,
  options: {
    readonly nodeId: string
    readonly cell:
      | { readonly groupId: string; readonly cell: number }
      | undefined
    readonly landing: StoryboardLanding | null | undefined
    readonly nodes: readonly NodeV4[]
  },
): void {
  const { nodeId, cell, landing, nodes } = options
  const groupId = cell?.groupId
  const cellIndex = cell?.cell
  const landingGroup = landing?.groupId
  useLayoutEffect(() => {
    const element = ref.current
    if (
      !element ||
      !landing ||
      groupId === undefined ||
      cellIndex === undefined
    )
      return
    if (landingGroup !== groupId) return
    if (Date.now() - landing.at > LANDING_WINDOW_MS) return
    const self = nodes.find((node) => node.id === nodeId)
    const source = nodes.find((node) => node.id === landing.sourceId)
    if (!self || !source) return
    if (self.data.kind !== 'image' || source.data.kind !== 'image') return

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const delay = cellIndex * STAGGER_MS
    if (reduce) {
      element.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: 120,
        delay,
        fill: 'backwards',
      })
      return
    }
    const size = landing.size
    const sourceW = collapsedImageWidth(source.data)
    const sourceH = collapsedImageHeight(source.data)
    const selfW = collapsedImageWidth(self.data)
    const selfH = collapsedImageHeight(self.data)
    const col = cellIndex % size
    const row = Math.floor(cellIndex / size)
    const fromX = source.position.x + ((col + 0.5) * sourceW) / size
    const fromY = source.position.y + ((row + 0.5) * sourceH) / size
    const toX = self.position.x + selfW / 2
    const toY = self.position.y + selfH / 2
    const scale = Math.max(sourceW / size / selfW, 0.1)
    element.style.transformOrigin = 'center'
    element.animate(
      [
        {
          transform: `translate(${fromX - toX}px, ${fromY - toY}px) scale(${scale})`,
          opacity: 0.4,
        },
        { transform: 'none', opacity: 1 },
      ],
      {
        duration:
          Number.parseFloat(cssVar('--spring-slot-duration', '340')) || 340,
        easing: cssVar('--spring-slot-ease', 'cubic-bezier(.22,1,.36,1)'),
        delay,
        fill: 'backwards',
      },
    )
    // 只在「这一组刚落下」那一刻播一次：依赖只跟组号走。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [landingGroup, groupId, cellIndex])
}
