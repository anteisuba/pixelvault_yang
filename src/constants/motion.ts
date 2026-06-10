/**
 * Motion canon — 全站动效常量（docs/design/direction.md §动效 canon）。
 *
 * 规则：
 * - 缓动全站统一 EASE_STANDARD 一条曲线；退出动画用更短时长，不换曲线。
 * - 时长走四档刻度，不要自创数值。
 * - framer-motion 调用方必须配合 useReducedMotion（from 'motion/react'）：
 *   `transition={motionTransition('base', useReducedMotion())}`。
 * - CSS 侧对应 token 在 globals.css @theme：--ease-standard / --duration-*。
 */

/** 全站唯一缓动曲线（framer-motion 数组形式） */
export const EASE_STANDARD: [number, number, number, number] = [
  0.22, 1, 0.36, 1,
]

/** 同一曲线的 CSS 字符串（行内 style 优先用 var(--ease-standard)） */
export const EASE_STANDARD_CSS = 'cubic-bezier(0.22, 1, 0.36, 1)'

/** 时长刻度（秒，framer-motion 用） */
export const DURATION = {
  /** hover / 按压 / 图标与 chip 状态切换 */
  fast: 0.12,
  /** popover / menu / 轻量浮层出现 */
  base: 0.2,
  /** drawer / dialog / 面板展开折叠 */
  slow: 0.32,
  /** 页面级首次进场（仅陈列面） */
  reveal: 0.5,
} as const

/** 时长刻度（毫秒，CSS / 定时器用） */
export const DURATION_MS = {
  fast: 120,
  base: 200,
  slow: 320,
  reveal: 500,
} as const

export type MotionDurationPreset = keyof typeof DURATION

/** stagger：50ms 步进，总延迟封顶 300ms */
export const STAGGER_STEP_S = 0.05
export const STAGGER_MAX_S = 0.3

/** 第 index 个元素的 stagger 延迟（秒） */
export function staggerDelay(index: number): number {
  return Math.min(index * STAGGER_STEP_S, STAGGER_MAX_S)
}

/**
 * framer-motion transition 预设。
 * reducedMotion 传 useReducedMotion() 的返回值（true 时时长归零）。
 */
export function motionTransition(
  preset: MotionDurationPreset,
  reducedMotion: boolean | null = false,
): { duration: number; ease: [number, number, number, number] } {
  return {
    duration: reducedMotion ? 0 : DURATION[preset],
    ease: EASE_STANDARD,
  }
}
