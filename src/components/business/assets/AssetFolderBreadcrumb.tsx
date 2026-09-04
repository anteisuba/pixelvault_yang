'use client'

import { ChevronRight } from 'lucide-react'

import { cn } from '@/lib/utils'

/**
 * 面包屑 `素材 › 鸣潮 › 弗洛洛` —— `docs/references/pages/assets.md` §3 末。
 *
 * 进文件夹**不能把用户踢出应用壳**，所以夹内页/总览页不是全屏 overlay，而是
 * 同一个页面里换一段内容 + 一条可点回的面包屑；`Esc` 等价于返回上一级。
 */

export interface BreadcrumbCrumb {
  key: string
  label: string
  onClick: () => void
}

interface AssetFolderBreadcrumbProps {
  /** 可点回的层级（不含当前层）。 */
  crumbs: BreadcrumbCrumb[]
  /** 当前层 —— 不可点。 */
  current: string
  /** 当前层的计数（可选）。 */
  count?: number
  /** 当前文件夹范围的主要动作，例如新建子文件夹。 */
  action?: React.ReactNode
  className?: string
}

export function AssetFolderBreadcrumb({
  crumbs,
  current,
  count,
  action,
  className,
}: AssetFolderBreadcrumbProps) {
  return (
    <nav
      aria-label={current}
      className={cn('flex min-w-0 flex-wrap items-center gap-1', className)}
    >
      {crumbs.map((crumb) => (
        <span key={crumb.key} className="flex min-w-0 items-center gap-1">
          <button
            type="button"
            onClick={crumb.onClick}
            className="max-w-40 truncate rounded-md px-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            {crumb.label}
          </button>
          <ChevronRight
            aria-hidden
            className="size-3 shrink-0 text-muted-foreground"
          />
        </span>
      ))}
      <span className="flex min-w-0 items-baseline gap-1.5">
        <h2 className="max-w-64 truncate px-1 text-sm font-medium text-foreground">
          {current}
        </h2>
        {typeof count === 'number' && (
          <span className="text-xs tabular-nums text-muted-foreground">
            {count}
          </span>
        )}
      </span>
      {action ? <span className="ml-auto shrink-0">{action}</span> : null}
    </nav>
  )
}
