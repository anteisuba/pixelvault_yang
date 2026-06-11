'use client'

import type * as React from 'react'

import {
  ResponsivePopover,
  ResponsivePopoverContent,
  ResponsivePopoverTrigger,
} from '@/components/ui/responsive-popover'
import { cn } from '@/lib/utils'

export const studioToolTriggerClass = cn(
  'relative inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm text-muted-foreground transition-colors duration-150',
  'hover:bg-muted/30 hover:text-foreground',
  'focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none',
)

/**
 * StudioToolSurface / StudioToolSurfaceTrigger — 工具栏 chip 的统一披露根与
 * 触发器：桌面 = 锚定 Popover，移动端 = 底部 Drawer
 * （docs/design/direction.md §Studio 工具栏规则）。
 *
 * 新 chip 一律用这对原语，不要直接用 Popover —— 锚定 popover 在手机窄视口
 * 会被裁切。仍用裸 `Popover` 作根的旧宿主不受影响：`StudioToolPopoverContent`
 * 只有在 StudioToolSurface 根的上下文里才会切换成抽屉。
 */
export const StudioToolSurface = ResponsivePopover
export const StudioToolSurfaceTrigger = ResponsivePopoverTrigger

type StudioToolSurfaceSize = 'small' | 'action' | 'medium'

const studioToolSurfaceSizeClass: Record<StudioToolSurfaceSize, string> = {
  small: 'w-[min(280px,calc(100vw-2rem))] p-3',
  action: 'w-[min(360px,calc(100vw-2rem))] p-2.5',
  medium: 'w-[min(640px,calc(100vw-2rem))] overflow-hidden !p-0',
}

/** 移动端抽屉里宽度交给抽屉本身，只保留内边距语义。 */
const studioToolSurfaceMobileClass: Record<StudioToolSurfaceSize, string> = {
  small: '',
  action: '',
  medium: 'px-0 pt-0',
}

interface StudioToolPopoverContentProps extends Omit<
  React.ComponentProps<typeof ResponsivePopoverContent>,
  'label'
> {
  size?: StudioToolSurfaceSize
  /**
   * 浮层可访问名称（移动端抽屉标题 / 桌面 aria-label）。
   * 迁移到 StudioToolSurface 根的宿主必须传；仍用裸 Popover 根的旧宿主
   * 可暂缺（过渡期）。
   */
  label?: string
}

export function StudioToolPopoverContent({
  size = 'small',
  side = 'top',
  align = 'center',
  sideOffset = 12,
  collisionPadding = 12,
  label,
  className,
  mobileClassName,
  onFocusOutside,
  onInteractOutside,
  onPointerDownOutside,
  ...props
}: StudioToolPopoverContentProps) {
  return (
    <ResponsivePopoverContent
      data-studio-tool-popover=""
      label={label ?? ''}
      side={side}
      align={align}
      sideOffset={sideOffset}
      collisionPadding={collisionPadding}
      className={cn(
        'rounded-xl border-border/70 bg-popover/95 shadow-2xl shadow-black/20 backdrop-blur-xl',
        'data-[state=open]:duration-150 data-[state=closed]:duration-100',
        'data-[side=top]:slide-in-from-bottom-1 data-[side=bottom]:slide-in-from-top-1',
        studioToolSurfaceSizeClass[size],
        className,
      )}
      mobileClassName={cn(studioToolSurfaceMobileClass[size], mobileClassName)}
      onFocusOutside={(event) => {
        event.preventDefault()
        onFocusOutside?.(event)
      }}
      onInteractOutside={(event) => {
        event.preventDefault()
        onInteractOutside?.(event)
      }}
      onPointerDownOutside={(event) => {
        event.preventDefault()
        onPointerDownOutside?.(event)
      }}
      {...props}
    />
  )
}
