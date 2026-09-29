'use client'

import { useEffect, useState } from 'react'
import { animate, useReducedMotion } from 'motion/react'

import { DURATION, EASE_STANDARD } from '@/constants/motion'
import type {
  NodeGraphV4LayoutSlide,
  NodeGraphV4Offset,
} from '@/hooks/node/use-node-graph-v4'

/**
 * 「整理」之后卡片滑到新位置（§7 摆放 A · 320 标准）。
 *
 * state 已经一步写到终点；这里给出**还剩多少没滑完**（1 → 0），调用方把
 * `(旧坐标 − 新坐标) × 剩余` 当渲染期偏移加上去。连线跟着卡的渲染坐标走，所以线也
 * 一路滑过去，⛔ 不会先跳到终点再等卡。减少动态效果下不滑，直接到位。
 */
export function useLayoutSlide(slide: NodeGraphV4LayoutSlide | null): number {
  const reduce = useReducedMotion()
  const [running, setRunning] = useState<{
    readonly id: number
    readonly left: number
  } | null>(null)

  useEffect(() => {
    if (!slide || reduce) return
    const controls = animate(1, 0, {
      duration: DURATION.slow,
      ease: EASE_STANDARD,
      onUpdate: (left) => setRunning({ id: slide.id, left }),
      onComplete: () => setRunning(null),
    })
    return () => controls.stop()
  }, [slide, reduce])

  return slide && running?.id === slide.id ? running.left : 0
}

/** 这一张卡此刻的滑动偏移（没挪过 / 已滑完 = `null`）。 */
export function layoutSlideOffset(
  slide: NodeGraphV4LayoutSlide | null,
  left: number,
  id: string,
  to: NodeGraphV4Offset,
): NodeGraphV4Offset | null {
  if (!slide || left <= 0) return null
  const from = slide.from.get(id)
  if (!from || (from.x === to.x && from.y === to.y)) return null
  return { x: (from.x - to.x) * left, y: (from.y - to.y) * left }
}
