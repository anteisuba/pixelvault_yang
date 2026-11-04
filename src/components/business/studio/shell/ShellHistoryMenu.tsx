'use client'

import { useState, type KeyboardEvent, type ReactNode } from 'react'
import { useFormatter, useTranslations } from 'next-intl'

import { Plus, Search } from '@/components/icons'
import {
  SESSION_ROW_MENU_ATTR,
  StudioOperatorSessionDeleteDialog,
  StudioOperatorSessionRow,
} from '@/features/assistant'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

/** 一天的毫秒数 —— 只给「今天 / 昨天 / 更早」的日差用。 */
const MS_PER_DAY = 86_400_000

/** 加载中那三条骨架的宽（不等长，读起来是三个标题而不是三条进度条）。 */
const SHELL_HISTORY_SKELETON_WIDTHS = ['w-3/5', 'w-1/2', 'w-7/10'] as const

type DayBucket = 'today' | 'yesterday' | 'earlier'

export interface ShellHistoryItem {
  id: string
  title: string | null
  updatedAt: string
  /** 标题前面那一格（群聊叠两颗头像）。 */
  leading?: ReactNode
}

interface ShellHistoryMenuProps {
  /** 触发键（对话头里那一颗）。 */
  children: ReactNode
  /** 悬停在键上那一句。 */
  tooltip: string
  /** 第一行「＋ …」。 */
  newLabel: string
  newDisabled?: boolean
  onNew(): void
  items: readonly ShellHistoryItem[]
  currentId: string | null
  /** 一条都还没拿到的那一刻（拿到过就照旧画手上那份，后台刷新原地换）。 */
  loading: boolean
  error?: string | null
  titleMaxLength?: number
  /** 这一行此刻能不能点 / 能不能删（在飞、正在删别的…）。 */
  selectDisabled?(id: string): boolean
  deleteDisabled?(id: string): boolean
  renamingId?: string | null
  deletingId?: string | null
  onOpenChange?(open: boolean): void
  onSelect(id: string): void
  onRename(id: string, title: string): void
  /** 删成功回 true（确认态这时才放下）。 */
  onDelete(id: string): Promise<boolean>
  testId: string
  /**
   * 顶上一格搜索 + 只摊最近 `limit` 条、底下「全部…」（owner 11-04）。搜的是手上已经拿到的那份。
   * 不给 = 整份照摊、没有搜索。
   */
  search?: {
    placeholder: string
    emptyLabel: string
    allLabel: string
    limit: number
  }
}

interface ShellHistoryBucket {
  id: DayBucket
  items: ShellHistoryItem[]
  /** 行右边那枚时间：今天 / 昨天写钟点，更早写月日。 */
  timeLabel(iso: string): string
}

/**
 * 按今天 / 昨天 / 更早分组（列表已按时间倒序）。日差按本地零点算（23:50 和次日 00:10 是两天）。
 */
function useShellHistoryBuckets(
  items: readonly ShellHistoryItem[],
): ShellHistoryBucket[] {
  const format = useFormatter()
  const bucketOf = (iso: string): DayBucket => {
    const midnight = (value: Date) =>
      new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime()
    const days = Math.round(
      (midnight(new Date()) - midnight(new Date(iso))) / MS_PER_DAY,
    )
    if (days <= 0) return 'today'
    if (days === 1) return 'yesterday'
    return 'earlier'
  }
  const timeLabelFor = (bucket: DayBucket) => (iso: string) =>
    bucket === 'earlier'
      ? format.dateTime(new Date(iso), { month: '2-digit', day: '2-digit' })
      : format.dateTime(new Date(iso), { hour: '2-digit', minute: '2-digit' })

  const buckets: ShellHistoryBucket[] = []
  for (const item of items) {
    const bucket = bucketOf(item.updatedAt)
    const last = buckets.at(-1)
    if (last?.id === bucket) last.items.push(item)
    else
      buckets.push({
        id: bucket,
        items: [item],
        timeLabel: timeLabelFor(bucket),
      })
  }
  return buckets
}

/**
 * 对话头里「对话记录」与「聊天」两颗键弹出来的那一块（用户 10-25 定样子：第一行「＋ 新…」，下面按今天 /
 * 昨天 / 更早分组，时间靠右，当前那一行浅灰底）。两边同一块，⛔ 各画各的。
 *
 * 行就是标题 ▾ 历史那一套（`StudioOperatorSessionRow` 的 `compact`）：就地改名；删除弹窗挂在
 * 菜单外面（点垃圾桶菜单就关了）。
 */
export function ShellHistoryMenu({
  children,
  tooltip,
  newLabel,
  newDisabled = false,
  onNew,
  items,
  currentId,
  loading,
  error,
  titleMaxLength,
  selectDisabled,
  deleteDisabled,
  renamingId = null,
  deletingId = null,
  onOpenChange,
  onSelect,
  onRename,
  onDelete,
  testId,
  search,
}: ShellHistoryMenuProps) {
  const t = useTranslations('StudioShell')
  const [open, setOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<{ id: string } | null>(null)
  const [query, setQuery] = useState('')
  const [showAll, setShowAll] = useState(false)

  const needle = query.trim().toLocaleLowerCase()
  const matches = needle
    ? items.filter((item) =>
        (item.title ?? '').toLocaleLowerCase().includes(needle),
      )
    : items
  // 搜着的时候搜整份；没搜只摊最近那几条，「全部」再放开。
  const capped = search && !needle && !showAll && matches.length > search.limit
  const shown = capped ? matches.slice(0, search.limit) : matches
  const buckets = useShellHistoryBuckets(shown)

  /**
   * ⚠ 下拉菜单自己吃按键（打字跳到首字母那一行）：输入框里的键先拦下，只放 Esc（关菜单）；
   * ↓ 把焦点交给第一行，之后就是菜单自己的上下键。
   */
  const onSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') return
    event.stopPropagation()
    if (event.key !== 'ArrowDown') return
    event.preventDefault()
    event.currentTarget
      .closest('[role=menu]')
      ?.querySelector<HTMLElement>('[role=menuitem]:not([data-disabled])')
      ?.focus()
  }

  return (
    <>
      <DropdownMenu
        modal={false}
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (!next) {
            setQuery('')
            setShowAll(false)
          }
          onOpenChange?.(next)
        }}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom">{tooltip}</TooltipContent>
        </Tooltip>
        <DropdownMenuContent
          side="bottom"
          align="start"
          sideOffset={8}
          data-testid={testId}
          className={cn(
            'max-h-[70svh] overflow-y-auto rounded-xl p-1.5',
            search ? 'w-72' : 'w-64',
          )}
          onInteractOutside={(event) => {
            // 行菜单（右键 / ⋯）是另一层下拉，点它不算外面。
            if (
              event.target instanceof Element &&
              event.target.closest(`[${SESSION_ROW_MENU_ATTR}]`)
            )
              event.preventDefault()
          }}
        >
          {search ? (
            <div className="flex h-9 items-center gap-2 px-2.25 text-muted-foreground">
              <Search className="size-4 shrink-0" aria-hidden />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={onSearchKeyDown}
                placeholder={search.placeholder}
                aria-label={search.placeholder}
                data-testid={`${testId}-search`}
                className="min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground lg:text-sm"
              />
            </div>
          ) : null}
          <DropdownMenuItem
            data-testid={`${testId}-new`}
            disabled={newDisabled}
            onSelect={onNew}
            className="h-9 gap-2 px-2.25 font-medium"
          >
            <Plus className="size-4" aria-hidden />
            <span className="min-w-0 truncate">{newLabel}</span>
          </DropdownMenuItem>
          {loading && items.length === 0
            ? SHELL_HISTORY_SKELETON_WIDTHS.map((width) => (
                <div key={width} className="flex h-9 items-center px-2.25">
                  <Skeleton className={`h-2.5 rounded-sm ${width}`} />
                </div>
              ))
            : null}
          {buckets.map((bucket) => (
            <div key={bucket.id}>
              <DropdownMenuLabel className="px-2.25 pt-2 pb-0.5 text-2xs font-normal text-muted-foreground">
                {t(`historyBucket.${bucket.id}`)}
              </DropdownMenuLabel>
              {bucket.items.map((item) => (
                <StudioOperatorSessionRow
                  key={item.id}
                  compact
                  session={{ id: item.id, title: item.title }}
                  {...(titleMaxLength ? { titleMaxLength } : {})}
                  leading={item.leading}
                  domainLabel={null}
                  dateLabel={bucket.timeLabel(item.updatedAt)}
                  current={item.id === currentId}
                  selectDisabled={
                    deletingId === item.id ||
                    (selectDisabled?.(item.id) ?? false)
                  }
                  deleteDisabled={
                    deletingId !== null || (deleteDisabled?.(item.id) ?? false)
                  }
                  renaming={renamingId === item.id}
                  deleting={deletingId === item.id}
                  onSelect={() => onSelect(item.id)}
                  onRename={(title) => onRename(item.id, title)}
                  onRequestDelete={() => setDeleteTarget(item)}
                />
              ))}
            </div>
          ))}
          {search && needle && matches.length === 0 ? (
            <p
              data-testid={`${testId}-no-match`}
              className="px-2.25 py-3 text-2sm text-muted-foreground"
            >
              {search.emptyLabel}
            </p>
          ) : null}
          {capped ? (
            <DropdownMenuItem
              data-testid={`${testId}-all`}
              onSelect={(event) => {
                // 留在菜单里，就地放开整份。
                event.preventDefault()
                setShowAll(true)
              }}
              className="mt-1 h-9 justify-center text-2sm text-muted-foreground"
            >
              {search.allLabel}
            </DropdownMenuItem>
          ) : null}
          {error ? (
            <p className="px-2.25 py-2 text-2sm text-destructive">{error}</p>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      <StudioOperatorSessionDeleteDialog
        target={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onDelete={onDelete}
      />
    </>
  )
}
