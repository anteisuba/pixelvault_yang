/**
 * 画布「点开」的开合（node-canvas-v2 §1 第 12 条 · 方向 A「从卡上长出来」）。
 *
 * 每样东西都从它的来处长出来、关上反着缩回来处 —— 开合永远成对。形态与工作台 chip
 * 弹层同一颗（0.72 · 模糊 4 · 开 slot 弹簧 · 关 200 缓入），⛔ 画布另起一套数。
 *
 * ⚠ 开完**必须把 `filter` 清成 `none`**（`transitionEnd`）：留着 `blur(0px)` 也算一层
 * filter，它会成为里面玻璃（`surface-glass` 的 backdrop-filter）的 backdrop root ——
 * 玻璃只采得到这一层自己的内容，身后的卡不再被模糊，只剩一层白纱透出来（owner
 * 2026-09-29 真机：工具条、提示词栏压在卡上看得见卡）。
 */

import type { TargetAndTransition } from 'motion/react'

import {
  CHIP_POPOVER,
  DURATION,
  EASE_IN,
  EASE_STANDARD,
  SPRING,
} from '@/constants/motion'

export interface ChromeMotion {
  readonly initial: TargetAndTransition
  readonly animate: TargetAndTransition
  readonly exit: TargetAndTransition
}

const shut = {
  opacity: 0,
  scale: CHIP_POPOVER.fromScale,
  filter: `blur(${CHIP_POPOVER.blurPx}px)`,
}
const shown = { opacity: 1, scale: 1, filter: 'blur(0px)' }

/** 工具条 / 提示词栏：从卡边长出来（开 slot 弹簧 · 关 200 缓入）。 */
export const GROW_FROM_EDGE: ChromeMotion = {
  initial: shut,
  animate: {
    ...shown,
    transition: SPRING.slot,
    transitionEnd: { filter: 'none' },
  },
  exit: { ...shut, transition: { duration: DURATION.base, ease: EASE_IN } },
}

/** 右键 / 空白菜单：从指针处长出来（开 200 · 关 120）。 */
export const GROW_FROM_POINTER: ChromeMotion = {
  initial: shut,
  animate: {
    ...shown,
    transition: { duration: DURATION.base, ease: EASE_STANDARD },
    transitionEnd: { filter: 'none' },
  },
  exit: { ...shut, transition: { duration: DURATION.fast, ease: EASE_IN } },
}

/** 减少动态效果：位移、缩放、模糊一律换成 120 淡入淡出。 */
export const FADE_ONLY: ChromeMotion = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: DURATION.fast } },
  exit: { opacity: 0, transition: { duration: DURATION.fast } },
}
