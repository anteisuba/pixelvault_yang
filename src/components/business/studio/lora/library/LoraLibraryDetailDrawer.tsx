'use client'

import type { ReactNode } from 'react'

import { LORA_LIBRARY_DETAIL_DRAWER_CLASS } from '@/constants/lora'
import { cn } from '@/lib/utils'
import { Drawer, DrawerContent, DrawerTitle } from '@/components/ui/drawer'

// 库结果区移动端（<1024）的详情宿主：封面网格里点一格 → 这个抽屉从底部升起，
// 装 LoraLibraryRowDetail 的 `layout="drawer"` 形态。
//
// 为什么是抽屉而不是原位展开：网格里「原位展开」会把同排的卡挤走、并让用户的
// 阅读位置跳动；抽屉盖在上面，关掉就回到原来的滚动位置（列表根本没动）。
// 关闭统一走 `onOpenChange(false)`——抓手下滑、点遮罩、Esc、返回键都是同一条路。
export function LoraLibraryDetailDrawer({
  open,
  onOpenChange,
  title,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 读屏用的抽屉标题 = LoRA 名（视觉标题由详情内容自己渲染）。 */
  title: string
  children: ReactNode
}) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent
        className={cn(
          'flex flex-col overflow-hidden',
          LORA_LIBRARY_DETAIL_DRAWER_CLASS,
        )}
      >
        <DrawerTitle className="sr-only">{title}</DrawerTitle>
        {children}
      </DrawerContent>
    </Drawer>
  )
}
