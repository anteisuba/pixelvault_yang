'use client'

/**
 * 图片节点提示词栏首行的**参考图轨**（spec §3：参考图进提示词栏，卡面不显示槽）。
 *
 * 形态跟视频卡参考轨同一档（48px 编号缩略，来源名悬停可见），但只有图、
 * 没有首/尾帧角色。序号由 `readVideoRail` 发，`@图1` 与视频卡共用一份坐标系。
 */

import Image from 'next/image'
import { useTranslations } from 'next-intl'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { ImageIcon, AlertTriangle } from '@/components/icons'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Spinner } from '@/components/ui/spinner'
import { motionTransition } from '@/constants/motion'
import { cn } from '@/lib/utils'
import type { VideoRailEntry } from '@/lib/video-node-rail'

import { useBrokenThumbs } from '../chrome/NodeMediaMissing'
import {
  FADE_ONLY,
  GROW_FROM_EDGE,
  type ChromeMotion,
} from '../chrome/chrome-motion'

const RAIL_THUMB_PX = 48

export interface ImageRailCandidate {
  readonly id: string
  readonly name: string
  readonly thumbnailUrl?: string | undefined
}

export interface ImageRailPendingItem {
  readonly id: string
  readonly name: string
  readonly progress: number
  readonly error?: string | null
}

export interface ImageRefRailProps {
  readonly items: readonly VideoRailEntry[]
  readonly pending?: readonly ImageRailPendingItem[]
  readonly capacity: number
  onOpen(sourceNodeId: string): void
  onRemove(edgeId: string): void
  readonly candidates: readonly ImageRailCandidate[]
  onPickFromCanvas(sourceNodeId: string): void
  onUpload(): void
  onLibrary(): void
  onRetryPending?(id: string): void
  onRemovePending?(id: string): void
  readonly animateOnMount?: boolean
  readonly disabled?: boolean
  /** 画中框参考行的 44px 无角标缩略。 */
  readonly variant?: 'prompt' | 'frame'
  readonly className?: string
}

function RailCell({
  children,
  enter,
  frame = false,
}: {
  readonly children: React.ReactNode
  readonly enter?: ChromeMotion
  readonly frame?: boolean
}) {
  return (
    <motion.div
      className={frame ? 'size-11 shrink-0' : 'size-12 shrink-0'}
      initial={enter?.initial ?? false}
      animate={enter?.animate}
    >
      {children}
    </motion.div>
  )
}

export function ImageRefRail({
  items,
  pending = [],
  onOpen,
  onRemove,
  onRetryPending,
  onRemovePending,
  animateOnMount = false,
  disabled = false,
  variant = 'prompt',
  className,
}: ImageRefRailProps) {
  const tImage = useTranslations('StudioNode.v4.image')
  const reducedMotion = useReducedMotion()
  const enter = reducedMotion ? FADE_ONLY : GROW_FROM_EDGE
  const hoverTransition = motionTransition('fast', reducedMotion)
  const progressTransition = motionTransition('base', reducedMotion)
  // 素材删了：缩略图退回「没封面」的占位，⛔ 不画裂图（owner 09-28）。
  const thumbs = useBrokenThumbs()
  const frame = variant === 'frame'

  return (
    <div
      data-image-ref-rail
      onDoubleClick={(event) => event.stopPropagation()}
      className={cn(
        'nodrag nopan nowheel flex min-w-0 max-w-full items-start gap-2 overflow-x-auto',
        !frame && '-m-1 p-1',
        className,
      )}
    >
      <AnimatePresence initial={animateOnMount}>
        {items.map((item) => (
          <RailCell key={item.edgeId} enter={enter} frame={frame}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <motion.button
                  type="button"
                  disabled={disabled}
                  data-image-rail-item
                  data-image-rail-index={item.index}
                  title={item.sourceName}
                  aria-label={tImage('rail.itemLabel', {
                    index: item.index,
                    name: item.sourceName,
                  })}
                  onKeyDown={(event) => {
                    if (event.key !== 'Backspace' && event.key !== 'Delete') {
                      return
                    }
                    event.preventDefault()
                    onRemove(item.edgeId)
                  }}
                  animate={{ backgroundColor: 'var(--surface-fill)' }}
                  whileHover={{
                    backgroundColor: 'var(--surface-fill-hover)',
                  }}
                  transition={hoverTransition}
                  className={cn(
                    'nodrag nopan relative shrink-0 bg-surface-fill',
                    frame ? 'size-11 rounded-lg' : 'size-12 rounded-node-thumb',
                    'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                    'disabled:pointer-events-none disabled:opacity-60',
                  )}
                >
                  {thumbs.usable(item.thumbnailUrl) ? (
                    <Image
                      src={item.thumbnailUrl!}
                      alt=""
                      width={frame ? 44 : RAIL_THUMB_PX}
                      height={frame ? 44 : RAIL_THUMB_PX}
                      unoptimized
                      onError={() => thumbs.markBroken(item.thumbnailUrl!)}
                      className={cn(
                        'size-full object-cover',
                        frame ? 'rounded-lg' : 'rounded-node-thumb',
                      )}
                    />
                  ) : (
                    <span className="flex size-full items-center justify-center text-muted-foreground">
                      <ImageIcon aria-hidden className="size-5" />
                    </span>
                  )}
                  {!frame ? (
                    <span
                      aria-hidden
                      data-image-rail-badge
                      className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-3xs font-medium text-primary-foreground tabular-nums"
                    >
                      {item.index}
                    </span>
                  ) : null}
                </motion.button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-42">
                <DropdownMenuItem
                  data-image-rail-open
                  onSelect={() => onOpen(item.sourceNodeId)}
                >
                  {tImage('rail.open')}
                </DropdownMenuItem>
                <DropdownMenuItem
                  data-image-rail-remove
                  variant="destructive"
                  onSelect={() => onRemove(item.edgeId)}
                >
                  {tImage('rail.remove')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </RailCell>
        ))}
      </AnimatePresence>

      {pending.map((item) =>
        item.error ? (
          <RailCell key={item.id} frame={frame}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  data-image-rail-pending-state="error"
                  title={item.error}
                  aria-label={tImage('rail.uploadFailed', { name: item.name })}
                  className={cn(
                    'nodrag nopan flex shrink-0 items-center justify-center border border-dashed border-destructive text-destructive focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                    frame ? 'size-11 rounded-lg' : 'size-12 rounded-node-thumb',
                  )}
                >
                  <AlertTriangle aria-hidden className="size-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-42">
                <DropdownMenuItem
                  data-image-rail-pending-retry
                  onSelect={() => onRetryPending?.(item.id)}
                >
                  {tImage('rail.retry')}
                </DropdownMenuItem>
                <DropdownMenuItem
                  data-image-rail-pending-remove
                  variant="destructive"
                  onSelect={() => onRemovePending?.(item.id)}
                >
                  {tImage('rail.remove')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </RailCell>
        ) : (
          <RailCell key={item.id} frame={frame}>
            <span
              data-image-rail-pending-state="uploading"
              role="progressbar"
              aria-valuenow={Math.round(item.progress)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={tImage('rail.uploading', { name: item.name })}
              className={cn(
                'relative flex shrink-0 items-center justify-center border border-dashed border-border text-muted-foreground',
                frame ? 'size-11 rounded-lg' : 'size-12 rounded-node-thumb',
              )}
            >
              <Spinner aria-hidden className="size-4" />
              <span className="absolute inset-x-1.5 bottom-1.5 block h-0.5 overflow-hidden rounded-full bg-surface-fill-track">
                <motion.span
                  initial={false}
                  animate={{ width: `${Math.round(item.progress)}%` }}
                  transition={progressTransition}
                  className="block h-full rounded-full bg-primary"
                />
              </span>
            </span>
          </RailCell>
        ),
      )}
    </div>
  )
}
