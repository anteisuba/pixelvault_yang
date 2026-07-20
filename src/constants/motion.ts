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

/**
 * 吞噬三拍专属曲线（node-canvas.md §8，2026-07-10 owner demo 手感定稿，数值照抄）。
 * 与 EASE_STANDARD 分开命名——这两拍的手感（快吸入 / 软回弹）明显偏离全站默认
 * 曲线，不能共用一条。CSS 侧的同名变量在 globals.css `@theme`
 * （--ease-ingest / --ease-soft-return），Web Animations API（`Element.animate`）
 * 调用方直接用这两个字符串常量做 `easing`。
 */
export const EASE_INGEST_CSS = 'cubic-bezier(0.45, 0.05, 0.6, 1)'
export const EASE_SOFT_RETURN_CSS = 'cubic-bezier(0.3, 0.7, 0.4, 1.05)'

/**
 * 吞噬三拍数值表（node-canvas.md §8「幅度加强」档，逐字照抄，不做二次设计）。
 * `use-cast-ingest.ts` 的 Web Animations API keyframes 全部从这里取值——手势里
 * 不允许出现裸数字（禁 inline 魔法值，任务包 B1-3 红线）。
 */
export const INGEST_MOTION = {
  /** 张口：拖拽物进入合法目标热区。 */
  biteDurationMs: 180,
  biteScale: 1.08,
  biteTiltDeg: 1.5,
  biteOutlineWidthPx: 2,
  biteOutlineOffsetPx: 4,
  /** 吸入：松手后副本沿弧线飞入目标。 */
  swallowDurationMs: 620,
  swallowArcRiseRatio: 0.22,
  swallowSquashScaleX: 1.18,
  swallowSquashScaleY: 0.9,
  swallowEndScale: 0.16,
  swallowEndRotateDeg: 12,
  /** 消化落定：目标 gulp overshoot + 成分 chip pop。 */
  gulpDurationMs: 480,
  gulpOvershootScaleX: 0.98,
  gulpOvershootScaleY: 1.05,
  chipPopDurationMs: 340,
  chipPopScale: 1.2,
  /** 咬不动：软弹回 + 摇头。 */
  rejectDurationMs: 950,
  rejectLungeRatio: 0.58,
  rejectShakeDurationMs: 330,
  rejectShakeAmplitudePx: 5,
  rejectReasonVisibleMs: 2400,
  /** 拖拽判定阈值（§6.3：pointerdown 超过阈值才进入拖拽，否则按普通点击处理）。 */
  dragThresholdPx: 6,
} as const

/**
 * 墨线签署 / 褪去 + 本体软回弹数值表（canvas-relationship-v3 §2.7 R3-2，非折叠源
 * 落卡的动效分流——目标本体不消失，动画从"播吞掉动画但卡还在"改成"目标轻咽 +
 * 墨线画入 + 拖拽物软回弹回起点"）。时长全部snap到既有四档刻度
 * （fast120/base200/slow320），不自创数值：
 * - targetSettleMs = fast×2 = 240（spec"约240ms"的最近可组合档）
 * - inkDrawMs = slow = 320（spec 原文件直接给了 320，且明确"--ease-ingest 沿用"）
 * - inkHoldFadeMs = base = 200（spec"若不会常显，再 ~200ms 淡出隐藏"）
 * - unsignFadeMs = fast×2 = 240（spec"解绑反放 ~240ms"）
 * - bounceBackMs = slow = 320（spec"~300ms 软回弹"，snap 到最近档，非精确值——
 *   偏差在实现报告中点名）
 */
export const NODE_EDGE_SIGNING_MOTION = {
  /** 目标轻咽：scale 1→0.98→1.02→1。 */
  targetSettleMs: DURATION_MS.fast * 2,
  targetSettleScaleDown: 0.98,
  targetSettleScaleUp: 1.02,
  /** 墨线画入：来源锚点→目标锚点 stroke-dashoffset 满长→0。 */
  inkDrawMs: DURATION_MS.slow,
  /** 画入完成后，若判定不会常显（非选中的成分边），再淡出这么久后才真正隐藏。 */
  inkHoldFadeMs: DURATION_MS.base,
  /** 解绑：dashoffset 反放（0→满长）。 */
  unsignFadeMs: DURATION_MS.fast * 2,
  /** 被拖节点本体从落点软回弹回拖拽起点。 */
  bounceBackMs: DURATION_MS.slow,
} as const
