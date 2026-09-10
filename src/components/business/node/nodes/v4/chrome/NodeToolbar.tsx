'use client'

/**
 * 选中卡上方那条**玻璃胶囊工具条**（spec §1.4，画板 `Main.dc.html` / `ImageToolbar.dc.html`）。
 *
 * 形态定死：`surface-glass` + `shadow-node-chrome`，34px 纯图标格 + tooltip，
 * 语义分组之间一条竖线，危险项常态红字、hover 才上淡红底。⛔ 不上文字标签
 * （缩放态下太占画布，owner 2026-09-08 定）。
 *
 * **纯呈现 + items 描述**：不认识节点、不取 context、不自己定位。四类节点在
 * S2–S6 各自把 items 拼出来，外层定位（ReactFlow `NodeToolbar` 或绝对定位）由
 * 调用方给——这条工具条同样要出现在画中框与快速看里，绑死 ReactFlow 就用不了。
 *
 * 子菜单（编辑 / 更多）走现有 `DropdownMenu` 原语，⛔ 不自己写弹层。
 */

import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from 'react'
import type { LucideIcon } from 'lucide-react'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

export interface NodeToolbarAction {
  readonly id: string
  readonly label: string
  readonly icon: LucideIcon
  readonly onSelect: () => void
  readonly disabled?: boolean
  readonly danger?: boolean
  /** 当前处于「按下」态（如编辑子菜单开着）。 */
  readonly active?: boolean
  /** 给了就是子菜单入口：点开渲染这段内容（用 `DropdownMenuItem` 拼）。 */
  readonly menu?: ReactNode
}

/** 一组按钮；组与组之间画一条竖线。 */
export type NodeToolbarGroup = readonly NodeToolbarAction[]

export interface NodeToolbarProps {
  readonly groups: readonly NodeToolbarGroup[]
  readonly ariaLabel: string
  readonly className?: string
}

/**
 * ⚠ 必须转发 ref 并把 props 透传下去：Radix 的 `asChild`（tooltip / dropdown
 * trigger）是把自己的 props 合并到**这个 button** 上的，套一层 `<span>` 会让
 * tooltip 与菜单都失去触发点。
 */
const ToolbarCell = forwardRef<
  HTMLButtonElement,
  { action: NodeToolbarAction } & ComponentPropsWithoutRef<'button'>
>(function ToolbarCell({ action, className, ...rest }, ref) {
  const Icon = action.icon
  return (
    <button
      ref={ref}
      type="button"
      aria-label={action.label}
      data-toolbar-action={action.id}
      data-active={action.active ? 'true' : undefined}
      disabled={action.disabled}
      onClick={action.onSelect}
      className={cn(
        // 34px 格（`NODE_V4_CHROME.toolbarCellSize`）= size-8.5；圆角 10px = rounded-lg。
        'nodrag nopan flex size-8.5 items-center justify-center rounded-lg transition-[background-color,transform] duration-spring-press ease-spring-press active:scale-95',
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
        'disabled:pointer-events-none disabled:opacity-50',
        action.danger
          ? 'text-destructive hover:bg-destructive/10'
          : 'text-foreground hover:bg-surface-fill-hover',
        action.active && 'bg-surface-fill-hover',
        className,
      )}
      {...rest}
    >
      <Icon aria-hidden className="size-4" />
    </button>
  )
})

export function NodeToolbar({
  groups,
  ariaLabel,
  className,
}: NodeToolbarProps) {
  return (
    <TooltipProvider delayDuration={300}>
      <div
        role="toolbar"
        aria-label={ariaLabel}
        data-node-chrome="toolbar"
        className={cn(
          'inline-flex items-center gap-0.5 rounded-xl p-0.75 surface-glass shadow-node-chrome',
          className,
        )}
      >
        {groups
          .filter((group) => group.length > 0)
          .map((group, index) => (
            <div key={group[0]?.id ?? index} className="flex items-center">
              {index > 0 && (
                <span
                  aria-hidden
                  data-toolbar-divider
                  className="mx-1 h-4 w-px bg-border"
                />
              )}
              {group.map((action) =>
                action.menu ? (
                  <DropdownMenu key={action.id}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <DropdownMenuTrigger asChild>
                          <ToolbarCell action={action} />
                        </DropdownMenuTrigger>
                      </TooltipTrigger>
                      <TooltipContent>{action.label}</TooltipContent>
                    </Tooltip>
                    <DropdownMenuContent
                      align="start"
                      sideOffset={8}
                      className="min-w-44"
                    >
                      {action.menu}
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : (
                  <Tooltip key={action.id}>
                    <TooltipTrigger asChild>
                      <ToolbarCell action={action} />
                    </TooltipTrigger>
                    <TooltipContent>{action.label}</TooltipContent>
                  </Tooltip>
                ),
              )}
            </div>
          ))}
      </div>
    </TooltipProvider>
  )
}
