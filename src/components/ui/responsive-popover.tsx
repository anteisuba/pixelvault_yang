'use client'

import * as React from 'react'

import { useIsMobile } from '@/hooks/use-mobile'
import { isTouchPrimary } from '@/lib/touch'
import { cn } from '@/lib/utils'
import {
  Drawer,
  DrawerContent,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'

/**
 * ResponsivePopover — anchored Popover for fine pointers, vaul Drawer (bottom
 * sheet) for touch-primary compact viewports.
 *
 * 统一披露原语（docs/references/frontend.md §覆层行为矩阵）：工具栏 chip 与
 * 快速配置面板一律用它——不要手写 Popover/Drawer 分支，也不要在手机上裸用
 * Popover（窄视口会裁切）。表单、多步流程、可浏览的库用 ResponsiveDialog。
 *
 * API 差异说明：
 * - `label` 必填：触屏紧凑态渲染为视觉隐藏的 DrawerTitle（Radix a11y 要求），
 *   桌面端作为 PopoverContent 的 aria-label。
 * - `className` 只作用于桌面 Popover（宽度类在全宽抽屉上无意义）；移动端
 *   内容容器样式用 `mobileClassName`。
 * - align/side/sideOffset 等锚定 props 在触屏 Drawer 路径被忽略。
 *
 * Hydration 说明与 ResponsiveDialog 相同：useIsMobile() 服务端为 false，浮层
 * 由用户交互打开，水合时必然处于关闭态，原语切换不可见。不要传 defaultOpen。
 */

const ResponsivePopoverContext = React.createContext<{ useDrawer: boolean }>({
  useDrawer: false,
})

function ResponsivePopover({
  children,
  ...props
}: React.ComponentProps<typeof Popover>) {
  const isMobile = useIsMobile()
  // Width decides the compact layout, but input capability decides whether a
  // disclosure should become modal. A narrow desktop window still has a fine
  // pointer and must keep the anchored trigger interactive so clicking it a
  // second time can close the surface. Touch-primary compact viewports use the
  // bottom drawer as before.
  const useDrawer = isMobile && isTouchPrimary()
  const Component = useDrawer ? Drawer : Popover
  return (
    <ResponsivePopoverContext.Provider value={{ useDrawer }}>
      <Component {...props}>{children}</Component>
    </ResponsivePopoverContext.Provider>
  )
}

function ResponsivePopoverTrigger({
  ...props
}: React.ComponentProps<typeof PopoverTrigger>) {
  const { useDrawer } = React.useContext(ResponsivePopoverContext)
  const Component = useDrawer ? DrawerTrigger : PopoverTrigger
  return <Component {...props} />
}

interface ResponsivePopoverContentProps extends React.ComponentProps<
  typeof PopoverContent
> {
  /** 浮层的可访问名称：移动端为隐藏 DrawerTitle，桌面端为 aria-label。 */
  label: string
  /** 移动端抽屉内容容器的样式（className 只作用于桌面 Popover）。 */
  mobileClassName?: string
}

function ResponsivePopoverContent({
  label,
  className,
  mobileClassName,
  children,
  style,
  ...props
}: ResponsivePopoverContentProps) {
  const { useDrawer } = React.useContext(ResponsivePopoverContext)
  if (useDrawer) {
    return (
      <DrawerContent
        className="max-h-[85svh]"
        style={{
          maxHeight:
            'min(85svh, calc(100svh - var(--keyboard-inset, 0px) - 0.75rem))',
          ...style,
        }}
      >
        <DrawerTitle className="sr-only">{label}</DrawerTitle>
        <div
          className={cn('flex-1 overflow-y-auto px-4 pt-2', mobileClassName)}
          style={{
            paddingBottom: 'max(var(--keyboard-safe-area-bottom, 0px), 1rem)',
          }}
        >
          {children}
        </div>
      </DrawerContent>
    )
  }
  return (
    <PopoverContent
      aria-label={label}
      className={className}
      style={style}
      {...props}
    >
      {children}
    </PopoverContent>
  )
}

export { ResponsivePopover, ResponsivePopoverTrigger, ResponsivePopoverContent }
