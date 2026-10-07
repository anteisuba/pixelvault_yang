/**
 * 助手**记住了一条偏好**时，右上角那颗头像顶一下（owner 2026-10-07 动效第 3 批
 * 「助手记住偏好」）—— 告诉用户「这句话它带走了」，下回还在。
 *
 * ⚠ 命令式、纯装饰（与 `studio-operator-flash.ts` 同一类）：头像是一个跨面板的持久
 *   fixed 元素，⛔ 不为这一下进 React state。
 * ⚠ 动的是头像**里面**那一层：外壳那颗按钮的 transform 由 motion 的位移 / 缩放占着，
 *   WAAPI 写同一个属性会把它顶掉。
 * ⚠ 减少动效时不动；头像不在屏幕上就静默跳过。
 */

import { DURATION_MS, EASE_STANDARD_CSS } from '@/constants/motion'

const AVATAR_SELECTOR = '[data-testid="operator-avatar-toggle"]'

export function bumpAssistantAvatar(): void {
  if (typeof document === 'undefined') return
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
  // 第一格是触屏补命中区的透明圈，第二格才是头像图 / 字形。
  const inner = document.querySelector<HTMLElement>(AVATAR_SELECTOR)
    ?.children[1] as HTMLElement | undefined
  if (!inner || typeof inner.animate !== 'function') return
  inner.animate(
    [
      { transform: 'scale(1)' },
      { transform: 'scale(1.12)', offset: 0.45 },
      { transform: 'scale(1)' },
    ],
    { duration: DURATION_MS.slow, easing: EASE_STANDARD_CSS },
  )
}
