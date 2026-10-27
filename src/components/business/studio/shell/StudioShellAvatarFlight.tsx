'use client'

import { useEffect, useRef, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { cubicBezier } from 'motion/react'

import { EASE_STANDARD, SHELL_MOTION } from '@/constants/motion'

import { StudioOperatorCurrentAvatar } from '@/components/business/studio/assistant-operator/StudioOperatorAvatarSwitcher'

/** 头像的两个落点：对话头那一颗、台左上角那一颗（`data-shell-avatar`）。 */
export type StudioShellAvatarSpot = 'header' | 'bench'

export const STUDIO_SHELL_AVATAR_ATTR = 'data-shell-avatar'

export interface StudioShellAvatarFlightPlan {
  from: DOMRect
  to: StudioShellAvatarSpot
}

/** 起飞前量一下那一颗现在在哪（按下收起 / 展开的那一刻还在原位）。 */
export function measureStudioShellAvatar(
  root: HTMLElement | null,
  spot: StudioShellAvatarSpot,
): DOMRect | null {
  const node = root?.querySelector<HTMLElement>(
    `[${STUDIO_SHELL_AVATAR_ATTR}="${spot}"]`,
  )
  const rect = node?.getBoundingClientRect()
  return rect && rect.width > 0 ? rect : null
}

const ease = cubicBezier(...EASE_STANDARD)

/**
 * 对话收起 / 展开时头像飞过去（用户 10-27：⛔ 先消失再冒出来）。
 *
 * ⚠ 不用 Motion `layoutId` 接力：对话头那一颗在对话栏里，栏是 `overflow-hidden`、展开时
 *   整块从左边滑进来，接力的那一颗前半程一直被栏裁掉 —— 看着就是没了、再冒出来。
 *   这里起飞时在 body 上放一颗 fixed 的替身，每帧读落点**此刻**的位置追过去（落点自己还在跟着
 *   栏 / 台滑），到了再把真的那颗露出来。两头真的那颗在飞的这一拍藏着（外壳挂
 *   `studio-shell-avatar-flying`）。
 */
export function StudioShellAvatarFlight({
  plan,
  rootRef,
  onLanded,
}: {
  plan: StudioShellAvatarFlightPlan | null
  rootRef: RefObject<HTMLElement | null>
  onLanded(): void
}) {
  const ghostRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!plan) return
    const ghost = ghostRef.current
    if (!ghost) return
    const { from, to } = plan
    const start = performance.now()
    let frame = 0
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / SHELL_MOTION.pullMs)
      const target = measureStudioShellAvatar(rootRef.current, to) ?? from
      const k = ease(t)
      const x = from.left + (target.left - from.left) * k
      const y = from.top + (target.top - from.top) * k
      const size = from.width + (target.width - from.width) * k
      ghost.style.transform = `translate3d(${x}px, ${y}px, 0)`
      ghost.style.width = `${size}px`
      ghost.style.height = `${size}px`
      if (t < 1) frame = requestAnimationFrame(step)
      else onLanded()
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [plan, rootRef, onLanded])

  // 只在点了收起 / 展开之后才有 plan，服务端那一遍永远是 null，body 一定在。
  if (!plan) return null
  return createPortal(
    <div
      ref={ghostRef}
      aria-hidden
      data-testid="studio-shell-avatar-flight"
      className="pointer-events-none fixed top-0 left-0 z-50 rounded-full"
      style={{
        width: plan.from.width,
        height: plan.from.height,
        transform: `translate3d(${plan.from.left}px, ${plan.from.top}px, 0)`,
      }}
    >
      <StudioOperatorCurrentAvatar />
    </div>,
    document.body,
  )
}
