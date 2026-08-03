'use client'

import { useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'

import {
  ResponsivePopover,
  ResponsivePopoverContent,
  ResponsivePopoverTrigger,
} from '@/components/ui/responsive-popover'

interface SpecSummaryButtonProps {
  /**
   * 当前规格摘要的各段，按契约顺序。**只放值，不写字段名**（R8）——
   * `['1080P', '5 秒', '16:9']` 而不是 `['分辨率 1080P', ...]`。
   * 已设的项才进来；一项都没设时传空数组。
   */
  parts: string[]
  /** 一项都没设时的回落文案（R8：「编辑参数 ▾」）。 */
  emptyLabel: string
  /** 浮层的无障碍名。 */
  label: string
  disabled?: boolean
  /** 浮层里的内容 —— **二级面**，这里才允许出现 11px 弱化灰字标题（R1）。 */
  children: ReactNode
}

/**
 * 「参数收成一颗按钮」（账本 ⑥，owner 方案，取自紧凑侧车既有形态）。
 *
 * 按钮标签**就是当前规格摘要**：`1080P · 5 秒 · 16:9 ▾`。点开是 `ResponsivePopover`
 * （桌面浮层 ↔ 手机抽屉）。它一次解决四件事：规格全屏只说一次、主动作回到首屏、
 * 面板内不再有任何折叠体、以及连带解掉那 6 个 `.node-collapsible` 用
 * `grid-template-rows` 做过渡（布局属性，违反「合成层只动 transform/opacity」）的问题。
 *
 * ⚠ **标签不得被状态切换覆盖**（账本 ⑥ 原话）：`parts` 必须由**单一参数对象**派生，
 * 只在空态重置。若各处各自往里塞一段，生成中/失败时标签会跟着状态变，
 * 用户就再也认不出「我上次设的是什么」。
 *
 * ⚠ 用 `·` 串、单行、不折行。折行的那一刻它就不是一颗按钮了，是又一块面板。
 *
 * S6 首落（视频合并的逐段裁剪），S7 给 seedance 的 6 个折叠体用同一颗。
 */
export function SpecSummaryButton({
  parts,
  emptyLabel,
  label,
  disabled,
  children,
}: SpecSummaryButtonProps) {
  const [open, setOpen] = useState(false)
  const summary = parts.filter(Boolean).join(' · ')

  return (
    <ResponsivePopover open={open} onOpenChange={setOpen}>
      <ResponsivePopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label={label}
          className="canvas-detail-chip"
          data-unset={summary ? undefined : true}
        >
          <span className="canvas-detail-chip-value">
            {summary || emptyLabel}
          </span>
          <ChevronDown aria-hidden className="size-3 shrink-0" />
        </button>
      </ResponsivePopoverTrigger>
      <ResponsivePopoverContent align="start" className="w-80" label={label}>
        {children}
      </ResponsivePopoverContent>
    </ResponsivePopover>
  )
}
