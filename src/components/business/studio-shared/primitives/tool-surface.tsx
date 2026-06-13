'use client'

import type * as React from 'react'

import {
  ResponsivePopover,
  ResponsivePopoverContent,
  ResponsivePopoverTrigger,
} from '@/components/ui/responsive-popover'
import { ResponsiveDialogTitle } from '@/components/ui/responsive-dialog'
import { cn } from '@/lib/utils'

/**
 * Dialog 型工具面板的统一 chrome（决议 5 工具面板契约）。
 * 重型面板（多轮对话/大列表/多步表单）走居中 Dialog；轻面板走
 * StudioToolSurface 锚定 popover。两类共用同一套暗面外观与头部规范。
 */
export const studioDialogPaddingClass = '!gap-0 !p-0'
export const studioDialogMaxHeightClass = 'max-h-[85svh]'
export const studioDialogHeaderPaddingClass = 'px-5 py-3'
export const studioDialogBodyPaddingClass = 'px-5 pb-5 pt-1'
export const studioDialogBaseClass = cn(
  studioDialogPaddingClass,
  studioDialogMaxHeightClass,
  'overflow-hidden rounded-2xl border-border/40 bg-background shadow-2xl',
)
export const studioDialogBodyClass = cn(
  'overflow-y-auto',
  studioDialogBodyPaddingClass,
)
export const studioDialogHeaderClass = `flex items-center gap-2 border-b border-border/40 ${studioDialogHeaderPaddingClass} font-display text-sm font-medium`

interface StudioPanelHeaderProps extends React.ComponentProps<
  typeof ResponsiveDialogTitle
> {
  icon?: React.ReactNode
}

export function StudioPanelHeader({
  icon,
  children,
  className,
  ...props
}: StudioPanelHeaderProps) {
  return (
    <ResponsiveDialogTitle
      className={cn(studioDialogHeaderClass, className)}
      {...props}
    >
      {icon}
      {children}
    </ResponsiveDialogTitle>
  )
}

export const studioToolTriggerClass = cn(
  'relative inline-flex h-11 items-center gap-2 rounded-full px-3.5 text-sm font-medium text-muted-foreground transition-colors duration-fast ease-standard sm:h-9',
  'hover:bg-muted/40 hover:text-foreground',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
  'disabled:pointer-events-none disabled:opacity-50',
)

export const studioChipActiveClass =
  'bg-primary/10 text-primary ring-1 ring-primary/30'

interface StudioChipBadgeProps {
  children: React.ReactNode
  className?: string
  title?: string
  ariaLabel?: string
}

export function StudioChipBadge({
  children,
  className,
  title,
  ariaLabel,
}: StudioChipBadgeProps) {
  return (
    <span
      className={cn(
        'pointer-events-none absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-2xs font-semibold leading-none text-primary-foreground ring-1 ring-background',
        className,
      )}
      title={title}
      aria-label={ariaLabel}
    >
      {children}
    </span>
  )
}

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

export type StudioToolSurfaceSize = 'small' | 'action' | 'medium'

export const studioToolPopoverAnchorSide = 'top' as const
export const studioToolPopoverAnchorAlign = 'center' as const
export const studioToolPopoverAnchorSideOffset = 12
export const studioToolPopoverAnchorCollisionPadding = 12
export const studioToolPopoverMaxHeightClass = studioDialogMaxHeightClass
export const studioToolPopoverBaseClass = cn(
  'rounded-2xl border-border/70 bg-popover/95 shadow-2xl shadow-black/20 backdrop-blur-xl',
  'data-[state=open]:duration-150 data-[state=closed]:duration-100',
  'data-[side=top]:slide-in-from-bottom-1 data-[side=bottom]:slide-in-from-top-1',
)
export const studioToolPopoverWidthClass: Record<
  StudioToolSurfaceSize,
  string
> = {
  small: 'w-[min(280px,calc(100vw-2rem))]',
  action: 'w-[min(360px,calc(100vw-2rem))]',
  medium: 'w-[min(640px,calc(100vw-2rem))]',
}
export const studioToolPopoverPaddingClass: Record<
  StudioToolSurfaceSize,
  string
> = {
  small: 'p-3',
  action: 'p-2.5',
  medium: '!p-0',
}

export const studioToolSurfaceSizeClass: Record<StudioToolSurfaceSize, string> =
  {
    small: cn(
      studioToolPopoverWidthClass.small,
      studioToolPopoverPaddingClass.small,
    ),
    action: cn(
      studioToolPopoverWidthClass.action,
      studioToolPopoverPaddingClass.action,
    ),
    medium: cn(
      studioToolPopoverWidthClass.medium,
      studioToolPopoverPaddingClass.medium,
      'overflow-hidden',
    ),
  }

/** 移动端抽屉里宽度交给抽屉本身，只保留内边距语义。 */
export const studioToolSurfaceMobileClass: Record<
  StudioToolSurfaceSize,
  string
> = {
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
  side = studioToolPopoverAnchorSide,
  align = studioToolPopoverAnchorAlign,
  sideOffset = studioToolPopoverAnchorSideOffset,
  collisionPadding = studioToolPopoverAnchorCollisionPadding,
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
        studioToolPopoverBaseClass,
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
