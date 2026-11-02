'use client'

import type { ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'

import { motionTransition } from '@/constants/motion'
import { cn } from '@/lib/utils'

/**
 * 贴卡浮层的进场动效（批 4，owner 2026-08-03：「所有按钮的动效都要加上对应的，
 * 不可以直接打开」）。
 *
 * 画布上有 7 处 React Flow `NodeToolbar` 浮层 —— 近场工具条、快编面板、生成框、
 * 侧车工具条…… 在这之前**全都是瞬时挂载**：选中一张卡，生成框「啪」地出现在
 * 那里，没有任何从无到有的过程。
 *
 * ⚠ 只做**进场**，不做退场。`NodeToolbar` 的 `isVisible` 转 false 时会把 children
 * 直接卸载，`AnimatePresence` 拿不到退场时机 —— 要做退场得改成自己接管挂载，
 * 那会动到这块 chrome 与 React Flow 的配合方式，不在这一片里。而「不可以直接
 * 打开」这条要的正是进场。
 *
 * ⚠ 只动 `opacity` / `transform`（§13.2 合成层判据），时长走 canon 的 `base`
 * 档（200ms，落在判据的 150–250ms 里），曲线是全站唯一那条 `EASE_STANDARD`。
 * `useReducedMotion()` 为真时 `motionTransition` 把时长归零。
 */

export interface CanvasPopInProps {
  /**
   * 浮层贴在卡的哪一侧 —— 决定它从哪个方向浮起来。
   * `bottom` = 挂在卡下方（生成框、快编面板）→ 从上方 4px 处落下；
   * `top` = 挂在卡上方（近场工具条）→ 从下方 4px 处升起；
   * `right` = 挂在卡右侧（侧车）→ 从左侧 6px 处推出；
   * `left` = 挂在卡左侧（侧车被视口右缘挤过去时，台账 N）→ 从右侧 6px 处推出。
   */
  side: 'top' | 'bottom' | 'right' | 'left'
  children: ReactNode
  className?: string
}

/** 位移方向：都只有几个像素 —— 这是「浮起来」不是「飞进来」。 */
const OFFSET = {
  top: { x: 0, y: 4 },
  bottom: { x: 0, y: -4 },
  right: { x: -6, y: 0 },
  left: { x: 6, y: 0 },
} as const

export function CanvasPopIn({ side, children, className }: CanvasPopInProps) {
  const reducedMotion = useReducedMotion()
  const from = OFFSET[side]

  return (
    <motion.div
      initial={{ opacity: 0, x: from.x, y: from.y, scale: 0.98 }}
      animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
      transition={motionTransition('base', reducedMotion)}
      className={cn('pointer-events-auto', className)}
    >
      {children}
    </motion.div>
  )
}
