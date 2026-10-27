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

/** 台角那颗 = `size-8`。 */
const STUDIO_SHELL_EXPAND_CHAT_PX = 32

/** 落点跟着走的那一块：对话头那颗在对话正文里，台角那颗在台那一列里。 */
const MOVER: Record<StudioShellAvatarSpot, string> = {
  header: '[data-testid="studio-shell-conversation-body"]',
  bench: '[data-testid="studio-shell-bench-column"]',
}

/**
 * 台角那颗该落在哪：照 `StudioShellExpandChat` 摆自己的算法，直接从台头那一行算。
 * ⛔ 读那颗按钮自己 —— 它的位置是台变宽后 ResizeObserver 回头再摆的，晚一拍，边飞边量会一抖一抖。
 */
function measureBenchCorner(
  column: HTMLElement | null | undefined,
): DOMRect | null {
  const row = column?.querySelector<HTMLElement>('[data-bench-header]')
  if (!row) return null
  const rect = row.getBoundingClientRect()
  const inset =
    Number.parseFloat(
      getComputedStyle(row).getPropertyValue('--bench-header-inset'),
    ) || 0
  const size = STUDIO_SHELL_EXPAND_CHAT_PX
  return new DOMRect(
    rect.left + inset,
    rect.top + (rect.height - size) / 2,
    size,
    size,
  )
}

/**
 * 落点**走完之后**会在哪：那一块此刻在滑，滑完它的左边贴到对话栏的左边（收起：台那一列顶上来；
 * 展开：贴右的正文随栏变宽退回原位）。⛔ 直接追落点此刻的位置 —— 一开始会先往反方向冲。
 */
function measureLanding(
  root: HTMLElement | null,
  spot: StudioShellAvatarSpot,
): DOMRect | null {
  const mover = root?.querySelector<HTMLElement>(MOVER[spot])
  const anchor =
    (spot === 'bench' ? measureBenchCorner(mover) : null) ??
    measureStudioShellAvatar(root, spot)
  const section = root?.querySelector<HTMLElement>(
    '[data-testid="studio-shell-conversation"]',
  )
  // 收完那一拍对话栏 `display: none`，台那一列已经顶到位，不用再挪。
  if (!anchor || !mover || !section || section.offsetParent === null)
    return anchor
  const shift =
    mover.getBoundingClientRect().left - section.getBoundingClientRect().left
  return new DOMRect(
    anchor.left - shift,
    anchor.top,
    anchor.width,
    anchor.height,
  )
}

/**
 * 对话收起 / 展开时头像飞过去（用户 10-27：⛔ 先消失再冒出来）。
 *
 * ⚠ 不用 Motion `layoutId` 接力：对话头那一颗在对话栏里，栏是 `overflow-hidden`、展开时
 *   整块从左边滑进来，接力的那一颗前半程一直被栏裁掉 —— 看着就是没了、再冒出来。
 *   这里起飞时在 body 上放一颗 fixed 的替身，每帧量一次落点滑完会在哪（`measureLanding`）飞过去，
 *   到了再把真的那颗露出来。两头真的那颗在飞的这一拍藏着（外壳挂
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
      const target = measureLanding(rootRef.current, to) ?? from
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
