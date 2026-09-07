'use client'

/**
 * 卡内折叠段（HIG disclosure，定稿 2026-09-08）。
 *
 * 证据、关系带、图集之外的折叠内容统一走这一份：`surface-fill` 底、**无描边**、
 * 42px 标题行、13px/600 标题、右转 chevron、**计数靠右**，展开内容与标题之间一条
 * border。⛔ 不再各写一套 `rounded-md border` + `+ / −`。
 *
 * ⚠ 用 `<div>` + `aria-expanded` 而不是 `<details>`：ReactFlow 的节点在 transform
 * 里，`<details>` 的原生开合不受控，助手落改动时没法从外面同步开合态。
 */

import { ChevronRight } from 'lucide-react'
import { useState, type ReactNode } from 'react'

import { cn } from '@/lib/utils'

export function NodeV4Disclosure({
  title,
  count,
  defaultOpen = false,
  testId,
  children,
}: {
  title: string
  /** 标题尾部的灰色计数；`undefined` = 这一段没有可数的东西。 */
  count?: number
  defaultOpen?: boolean
  /** `data-disclosure` 的值，给测试与真机读数用。 */
  testId: string
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div
      data-disclosure={testId}
      data-open={open ? 'true' : 'false'}
      className="overflow-hidden rounded-xl bg-surface-fill corner-squircle"
    >
      <button
        type="button"
        aria-expanded={open}
        data-disclosure-toggle={testId}
        onClick={() => setOpen((value) => !value)}
        className="flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left transition-colors duration-(--duration-fast) ease-standard hover:bg-surface-fill-hover"
      >
        <ChevronRight
          aria-hidden
          className={cn(
            'size-3.5 shrink-0 text-muted-foreground transition-transform duration-spring-slot ease-spring-slot',
            open && 'rotate-90',
          )}
        />
        <span className="text-2sm font-semibold tracking-node-sec">
          {title}
        </span>
        {count === undefined ? null : (
          <span className="ml-auto font-mono text-3xs tabular-nums text-muted-foreground">
            {count}
          </span>
        )}
      </button>
      {open ? (
        <div className="border-t border-border/60 px-3 pt-2.5 pb-3">
          {children}
        </div>
      ) : null}
    </div>
  )
}
