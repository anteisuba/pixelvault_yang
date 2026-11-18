'use client'

import type { ReactNode } from 'react'

import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
} from '@/components/ui/drawer'

/** 接近满屏：顶上留一条缝，看得出后面还是那一台（同助手手机面板）。 */
const SHEET_HEIGHT = '95svh'

/**
 * 工作台里开库（11-18）的手机形态：桌面盖在舞台上的那块（标签台「收藏」· LoRA 台
 * 「+ LoRA」）在 <1024 换成接近满屏的底部抽屉 —— 往下拖、系统返回、面板里「收起」都关。
 * 装的是与桌面同一个面板元素（`variant="sheet"`），⛔ 为手机另写一套内容。
 */
export function BenchLibrarySheet({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      shouldScaleBackground={false}
    >
      {/* ⚠ 高度走 style：原语自带 `h-auto`，同属性两个类谁赢看 Tailwind 输出顺序。 */}
      <DrawerContent
        className="rounded-t-24 border-0 bg-popover pb-safe-bottom shadow-pop lg:hidden"
        style={{
          height: SHEET_HEIGHT,
          maxHeight: `min(${SHEET_HEIGHT}, calc(100svh - var(--keyboard-inset, 0px)))`,
        }}
      >
        <DrawerTitle className="sr-only">{title}</DrawerTitle>
        <DrawerDescription className="sr-only">{description}</DrawerDescription>
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      </DrawerContent>
    </Drawer>
  )
}
