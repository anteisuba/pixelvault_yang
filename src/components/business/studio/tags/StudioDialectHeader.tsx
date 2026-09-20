'use client'

import type { ReactNode } from 'react'

import { StudioDialectSwitch } from '@/components/business/studio/tags/StudioDialectSwitch'

interface StudioDialectHeaderProps {
  disabled?: boolean
  /** 这一行右边挂什么由宿主定（标签台挂模型 chip，自然语言台空着）。 */
  children?: ReactNode
}

/**
 * 两台参数列的**第一行**：一对分段切换（自然语言 · 标签）靠左。
 *
 * ⭐ **门要两边都有把手**。切换是两台之间唯一的门（D10 ④），只在其中一台装
 * 它就不是门、是单向阀 —— 真机上 `/studio/image` 因此进不去标签台。所以两台
 * 挂的是**同一颗组件、同一个位置**（各自参数列的第一个子元素），用户看到的
 * 是同一个控件换了个高亮位。
 *
 * ⚠ 只给图片档：视频与音频没有方言这一说，给它们一个切到别处去的开关是错的。
 */
export function StudioDialectHeader({
  disabled,
  children,
}: StudioDialectHeaderProps) {
  return (
    <div className="flex min-h-8 shrink-0 items-center gap-2">
      <StudioDialectSwitch disabled={disabled} />
      {children ? <div className="ml-auto min-w-0">{children}</div> : null}
    </div>
  )
}
