import { animate } from 'motion/react'

import { EASE_STANDARD } from '@/constants/motion'

/**
 * `/studio` 外壳四种动效（推 / 滑 / 叠 / 拉，9f-4）的命令式那一半：台、库叠层进出。
 * 时长从 `SHELL_MOTION` 取，`prefers-reduced-motion` 由调用方先挡掉（直接到位）。
 */

interface ShellMotionFrom {
  /** 横向位移：字符串 = 百分比（`'100%'`），数字 = 像素。 */
  x: string | number
  opacity?: number
}

/**
 * 进场：先把起点**同步**写上，再起动画 —— motion 的 `animate` 下一帧才开始，⛔ 先闪一帧
 * 落定的样子再跳回起点。在 layout effect 里调，第一帧画出来就在起点。
 */
export function shellEnter(
  element: HTMLElement,
  from: ShellMotionFrom,
  durationS: number,
): void {
  const startX = typeof from.x === 'number' ? `${from.x}px` : from.x
  const endX = typeof from.x === 'number' ? 0 : '0%'
  element.style.transform = `translateX(${startX})`
  if (from.opacity !== undefined) element.style.opacity = String(from.opacity)
  animate(
    element,
    {
      x: [from.x, endX],
      ...(from.opacity !== undefined ? { opacity: [from.opacity, 1] } : {}),
    },
    { duration: durationS, ease: EASE_STANDARD },
  )
}

/**
 * 退场：播完再往下走（换地址）。⚠ 后台标签页里动画可能停着不回调，最多等时长再多一拍，
 * ⛔ 卡住不跳转。
 */
export async function shellLeave(
  element: HTMLElement,
  to: ShellMotionFrom,
  durationS: number,
): Promise<void> {
  const animation = animate(
    element,
    { x: to.x, ...(to.opacity !== undefined ? { opacity: to.opacity } : {}) },
    { duration: durationS, ease: EASE_STANDARD },
  )
  await Promise.race([
    animation,
    new Promise((resolve) =>
      window.setTimeout(resolve, durationS * 1000 + LEAVE_GRACE_MS),
    ),
  ])
}

/** 退场兜底：比动画多等这么久还没播完就不等了。 */
const LEAVE_GRACE_MS = 150
