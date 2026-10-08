'use client'

import { useState, type ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'

import { EASE_STANDARD, LIQUID_TIMING } from '@/constants/motion'
import { cn } from '@/lib/utils'

/**
 * **换内容短模糊**（owner 2026-10-07 定，PC 动效方向「同一个元素变形、内容换的时候
 * 短暂糊一下」）—— 同一个位置上的字 / 图标换成另一份时，新内容由糊变清地进来。
 *
 * ⭐ 只有**进场**、没有退场：旧内容随 key 换掉立即卸下。⛔ 不套 `AnimatePresence`
 *   —— rAF 被冻住（后台标签页）时退场永远播不完，会留下一个 `opacity:0` 的残影
 *   （Dock / QueueBar / Lightbox 头注同一条教训）。
 * ⚠ **首次挂载不播**：只有 key 真的换过一次之后才糊进来。历史消息、刷新后重画的
 *   那一屏 ⛔ 不该整屏一起糊一下。
 * ⚠ `prefers-reduced-motion` 下直接换，⛔ 不模糊。
 */
export function useBlurSwapIn(
  swapKey: string,
  options: { blurPx?: number; durationS?: number } = {},
) {
  const blurPx = options.blurPx ?? LIQUID_TIMING.blurPx
  const durationS = options.durationS ?? LIQUID_TIMING.swapInS
  const reduceMotion = useReducedMotion()
  /* 「上一次渲染时的 key」放进 state（React 文档的「存前一次的值」写法）：
     key 一换就在同一次渲染里记成「换过了」。 */
  const [seen, setSeen] = useState({ key: swapKey, swapped: false })
  if (seen.key !== swapKey) setSeen({ key: swapKey, swapped: true })
  const animateIn = seen.swapped && !reduceMotion
  return {
    initial: animateIn ? { opacity: 0, filter: `blur(${blurPx}px)` } : false,
    animate: { opacity: 1, filter: 'blur(0px)' },
    transition: { duration: durationS, ease: EASE_STANDARD },
  } as const
}

/**
 * 行内版：包住一段字或一颗图标，`swapKey` 一换就糊进来。
 * 块级内容（整段正文、一行状态）直接用 `useBlurSwapIn` 接到自己的 `motion.*` 上。
 */
export function BlurSwap({
  swapKey,
  children,
  className,
}: {
  swapKey: string
  children: ReactNode
  className?: string
}) {
  const swap = useBlurSwapIn(swapKey)
  return (
    <motion.span
      key={swapKey}
      {...swap}
      className={cn('inline-flex items-center', className)}
    >
      {children}
    </motion.span>
  )
}
