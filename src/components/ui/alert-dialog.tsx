'use client'

import * as React from 'react'
import { AlertDialog as AlertDialogPrimitive } from 'radix-ui'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

function AlertDialog({
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Root>) {
  return <AlertDialogPrimitive.Root data-slot="alert-dialog" {...props} />
}

function AlertDialogTrigger({
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Trigger>) {
  return (
    <AlertDialogPrimitive.Trigger data-slot="alert-dialog-trigger" {...props} />
  )
}

function AlertDialogPortal({
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Portal>) {
  return (
    <AlertDialogPrimitive.Portal data-slot="alert-dialog-portal" {...props} />
  )
}

function AlertDialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Overlay>) {
  return (
    <AlertDialogPrimitive.Overlay
      data-slot="alert-dialog-overlay"
      className={cn(
        'fixed inset-0 z-50 bg-black/50 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0',
        className,
      )}
      {...props}
    />
  )
}

/**
 * 「从按钮位置长到正中」（owner 2026-10-08「提示与弹窗」第 2 题 A：删了找不回的大事
 * —— 删密钥、删项目、注销账号 —— 用正中弹窗，从按下的那颗键长出来）。
 *
 * 记住最近一次按下的位置（捕获阶段，全站一个监听）；弹窗挂上时如果那一下够新，
 * 就把 tw-animate 的进场 / 退场位移指到那一点：弹窗从那儿缩着出来、长到正中，
 * 关上时缩回那儿。键盘打开（没有新的按下）就在正中原地放大。
 * ⚠ 菜单项触发的（菜单随即关掉、键已经不在了）同样成立：记的是**点**，不是元素。
 * ⚠ `prefers-reduced-motion` 下不指位移（globals.css 也把动画压到 0.01ms）。
 */
const ORIGIN_FRESH_MS = 1000
const ORIGIN_FROM_SCALE = 0.2
let lastPointerDown: { x: number; y: number; at: number } | null = null
let pointerTrackerBound = false

function bindPointerTracker() {
  if (pointerTrackerBound || typeof document === 'undefined') return
  pointerTrackerBound = true
  document.addEventListener(
    'pointerdown',
    (event) => {
      lastPointerDown = {
        x: event.clientX,
        y: event.clientY,
        at: performance.now(),
      }
    },
    true,
  )
}

if (typeof document !== 'undefined') bindPointerTracker()

function pointToOrigin(node: HTMLElement) {
  const point = lastPointerDown
  if (!point || performance.now() - point.at > ORIGIN_FRESH_MS) return
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
  const dx = `${Math.round(point.x - window.innerWidth / 2)}px`
  const dy = `${Math.round(point.y - window.innerHeight / 2)}px`
  node.style.setProperty('--tw-enter-translate-x', dx)
  node.style.setProperty('--tw-enter-translate-y', dy)
  node.style.setProperty('--tw-enter-scale', String(ORIGIN_FROM_SCALE))
  node.style.setProperty('--tw-exit-translate-x', dx)
  node.style.setProperty('--tw-exit-translate-y', dy)
  node.style.setProperty('--tw-exit-scale', String(ORIGIN_FROM_SCALE))
}

function AlertDialogContent({
  className,
  size = 'default',
  ref,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Content> & {
  size?: 'default' | 'sm'
}) {
  const growFromPointer = React.useCallback(
    (node: HTMLDivElement | null) => {
      if (node) pointToOrigin(node)
      if (typeof ref === 'function') ref(node)
      else if (ref) ref.current = node
    },
    [ref],
  )
  return (
    <AlertDialogPortal>
      <AlertDialogOverlay />
      <AlertDialogPrimitive.Content
        ref={growFromPointer}
        data-slot="alert-dialog-content"
        data-size={size}
        className={cn(
          // 开：弹簧那一档（spring-expand，轻微过冲）；关：线性 base 缩回按下的那一点。
          'group/alert-dialog-content fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border bg-background p-6 shadow-lg data-[size=sm]:max-w-xs data-[state=closed]:animate-out data-[state=closed]:duration-base data-[state=closed]:ease-in data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:duration-spring-expand data-[state=open]:ease-spring-expand data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[size=default]:sm:max-w-lg',
          className,
        )}
        {...props}
      />
    </AlertDialogPortal>
  )
}

function AlertDialogHeader({
  className,
  ...props
}: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="alert-dialog-header"
      className={cn(
        'grid grid-rows-[auto_1fr] place-items-center gap-1.5 text-center has-data-[slot=alert-dialog-media]:grid-rows-[auto_auto_1fr] has-data-[slot=alert-dialog-media]:gap-x-6 sm:group-data-[size=default]/alert-dialog-content:place-items-start sm:group-data-[size=default]/alert-dialog-content:text-left sm:group-data-[size=default]/alert-dialog-content:has-data-[slot=alert-dialog-media]:grid-rows-[auto_1fr]',
        className,
      )}
      {...props}
    />
  )
}

function AlertDialogFooter({
  className,
  ...props
}: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="alert-dialog-footer"
      className={cn(
        'flex flex-col-reverse gap-2 group-data-[size=sm]/alert-dialog-content:grid group-data-[size=sm]/alert-dialog-content:grid-cols-2 sm:flex-row sm:justify-end',
        className,
      )}
      {...props}
    />
  )
}

function AlertDialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Title>) {
  return (
    <AlertDialogPrimitive.Title
      data-slot="alert-dialog-title"
      className={cn(
        'text-lg font-semibold sm:group-data-[size=default]/alert-dialog-content:group-has-data-[slot=alert-dialog-media]/alert-dialog-content:col-start-2',
        className,
      )}
      {...props}
    />
  )
}

function AlertDialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Description>) {
  return (
    <AlertDialogPrimitive.Description
      data-slot="alert-dialog-description"
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  )
}

function AlertDialogMedia({
  className,
  ...props
}: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="alert-dialog-media"
      className={cn(
        "mb-2 inline-flex size-16 items-center justify-center rounded-md bg-muted sm:group-data-[size=default]/alert-dialog-content:row-span-2 *:[svg:not([class*='size-'])]:size-8",
        className,
      )}
      {...props}
    />
  )
}

function AlertDialogAction({
  className,
  variant = 'default',
  size = 'default',
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Action> &
  Pick<React.ComponentProps<typeof Button>, 'variant' | 'size'>) {
  return (
    <Button variant={variant} size={size} asChild>
      <AlertDialogPrimitive.Action
        data-slot="alert-dialog-action"
        className={cn(className)}
        {...props}
      />
    </Button>
  )
}

function AlertDialogCancel({
  className,
  variant = 'outline',
  size = 'default',
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Cancel> &
  Pick<React.ComponentProps<typeof Button>, 'variant' | 'size'>) {
  return (
    <Button variant={variant} size={size} asChild>
      <AlertDialogPrimitive.Cancel
        data-slot="alert-dialog-cancel"
        className={cn(className)}
        {...props}
      />
    </Button>
  )
}

export {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogTitle,
  AlertDialogTrigger,
}
