'use client'

/**
 * 卡片右上角**弧形悬浮动作球**（Bencho `#1 Action node` 双向极坐标交错）。
 *
 * 仅在卡片**未选中**且**鼠标悬停**时从右上角顺弧扇出（选中态让位给居中的 `NodeToolbar`，
 * 两者互斥、零碰撞），提供 2–4 个单点高频动作（如快速看 / 复制 / 下载 / 删除）。
 *
 * ── 动效物理 ──────────────────────────────────────────────────────────────
 * - 展开：`index × 45ms` 逐颗从角心沿极坐标扇出，`EASE_ORB` 轻过冲。
 * - 收起：`(count - 1 - index) × 45ms` **逆序**沿原轨缩回角心，`EASE_IN`。
 * - `useReducedMotion()` 下关闭位移与交错，退为 `DURATION.fast` 原地淡入淡出。
 */

import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import type { LucideIcon } from '@/components/icons'

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { DURATION, EASE_IN, EASE_ORB } from '@/constants/motion'
import { cn } from '@/lib/utils'

export interface NodeCornerAction {
  readonly id: string
  readonly label: string
  readonly icon: LucideIcon
  readonly onSelect: () => void
  readonly disabled?: boolean
  readonly danger?: boolean
  readonly active?: boolean
}

export interface NodeCornerActionsProps {
  readonly actions: readonly NodeCornerAction[]
  readonly open: boolean
  readonly zoom?: number
  readonly onPointerEnter?: () => void
  readonly onPointerLeave?: () => void
  readonly onActionTriggered?: () => void
}

const ORB_STAGGER_S = 0.045
const ORB_CENTER_ANGLE_DEG = -45

export interface CornerOrbPosition {
  readonly x: number
  readonly y: number
  readonly originX: number
  readonly originY: number
}

/**
 * 计算围绕卡片右上角 `-45°` 对角线对称分布的极坐标落点（屏幕 px）。
 * `originX / originY` 略微内缩进卡片右上圆角内侧，使扇出与收回看起来从角心长出。
 */
export function computeCornerOrbPositions(
  count: number,
): readonly CornerOrbPosition[] {
  if (count <= 0) return []
  const radius = count >= 4 ? 52 : count === 3 ? 48 : 46
  const inset = count >= 4 ? 16 : 14
  const stepDeg = count >= 4 ? 40 : count === 3 ? 42 : 46
  const originX = -inset
  const originY = inset
  const startDeg = ORB_CENTER_ANGLE_DEG - ((count - 1) * stepDeg) / 2

  return Array.from({ length: count }, (_, index) => {
    const rad = ((startDeg + index * stepDeg) * Math.PI) / 180
    return {
      x: Math.round((originX + radius * Math.cos(rad)) * 10) / 10,
      y: Math.round((originY + radius * Math.sin(rad)) * 10) / 10,
      originX,
      originY,
    }
  })
}

export function NodeCornerActions({
  actions,
  open,
  zoom = 1,
  onPointerEnter,
  onPointerLeave,
  onActionTriggered,
}: NodeCornerActionsProps) {
  const reducedMotion = useReducedMotion()
  const safeZoom = zoom > 0 ? zoom : 1
  const positions = computeCornerOrbPositions(actions.length)

  if (actions.length === 0) return null

  return (
    <TooltipProvider delayDuration={0}>
      <div
        data-node-chrome="corner-actions"
        data-open={open ? 'true' : 'false'}
        onMouseEnter={onPointerEnter}
        onMouseLeave={onPointerLeave}
        onDoubleClick={(event) => event.stopPropagation()}
        className="pointer-events-none absolute top-0 right-0 z-20"
        style={{
          transform: `scale(${1 / safeZoom})`,
          transformOrigin: 'top right',
        }}
      >
        {/* 隐形拐角悬停桥：鼠标从卡片右上角划向圆球途中保持悬停态不断开。 */}
        {open ? (
          <div
            aria-hidden
            className="pointer-events-auto absolute -top-13 -right-13 size-24 rounded-full"
          />
        ) : null}

        <AnimatePresence>
          {open
            ? actions.map((action, index) => {
                const Icon = action.icon
                const pos = positions[index]!
                const openDelay = reducedMotion ? 0 : index * ORB_STAGGER_S
                const closeDelay = reducedMotion
                  ? 0
                  : (actions.length - 1 - index) * ORB_STAGGER_S

                return (
                  <Tooltip key={action.id}>
                    <TooltipTrigger asChild>
                      <motion.button
                        type="button"
                        aria-label={action.label}
                        data-corner-action={action.id}
                        data-active={action.active ? 'true' : undefined}
                        disabled={action.disabled}
                        onDoubleClick={(event) => event.stopPropagation()}
                        onClick={(event) => {
                          event.stopPropagation()
                          action.onSelect()
                          onActionTriggered?.()
                        }}
                        initial={
                          reducedMotion
                            ? { opacity: 0, x: pos.x, y: pos.y }
                            : {
                                opacity: 0,
                                x: pos.originX,
                                y: pos.originY,
                                scale: 0.35,
                              }
                        }
                        animate={
                          reducedMotion
                            ? {
                                opacity: 1,
                                x: pos.x,
                                y: pos.y,
                                transition: { duration: DURATION.fast },
                              }
                            : {
                                opacity: 1,
                                x: pos.x,
                                y: pos.y,
                                scale: 1,
                                transition: {
                                  duration: DURATION.base,
                                  delay: openDelay,
                                  ease: EASE_ORB,
                                },
                              }
                        }
                        exit={
                          reducedMotion
                            ? {
                                opacity: 0,
                                x: pos.x,
                                y: pos.y,
                                transition: { duration: DURATION.fast },
                              }
                            : {
                                opacity: 0,
                                x: pos.originX,
                                y: pos.originY,
                                scale: 0.35,
                                transition: {
                                  duration: DURATION.fast,
                                  delay: closeDelay,
                                  ease: EASE_IN,
                                },
                              }
                        }
                        whileHover={reducedMotion ? undefined : { scale: 1.08 }}
                        whileTap={reducedMotion ? undefined : { scale: 0.94 }}
                        className={cn(
                          'nodrag nopan touch-target pointer-events-auto surface-glass shadow-node-chrome',
                          'absolute -top-3.75 -right-3.75 flex size-7.5 items-center justify-center rounded-full',
                          'transition-colors duration-fast ease-standard hover:tint-hover',
                          'focus-visible:outline-none focus-visible:shadow-focus',
                          'disabled:pointer-events-none disabled:opacity-45',
                          action.danger
                            ? 'text-status-risk'
                            : action.active
                              ? 'bg-foreground text-background'
                              : 'text-foreground',
                        )}
                      >
                        <Icon aria-hidden className="size-3.5" />
                      </motion.button>
                    </TooltipTrigger>
                    <TooltipContent side="top" sideOffset={6}>
                      {action.label}
                    </TooltipContent>
                  </Tooltip>
                )
              })
            : null}
        </AnimatePresence>
      </div>
    </TooltipProvider>
  )
}
