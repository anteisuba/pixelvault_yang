'use client'

import { useCallback, useState, type ReactNode } from 'react'
import { useFormatter, useTranslations } from 'next-intl'

import { Plus } from '@/components/icons'
import { StudioOperatorSessionRow } from '@/components/business/studio/assistant-operator/StudioOperatorSessionRow'
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

/** 一天的毫秒数 —— 只给「今天 / 昨天 / 更早」的日差用。 */
const MS_PER_DAY = 86_400_000

/** 加载中那三条骨架的宽（不等长，读起来是三个标题而不是三条进度条）。 */
export const SHELL_HISTORY_SKELETON_WIDTHS = [
  'w-3/5',
  'w-1/2',
  'w-7/10',
] as const

type DayBucket = 'today' | 'yesterday' | 'earlier'

export interface ShellHistoryItem {
  id: string
  title: string | null
  updatedAt: string
  /** 行右边时间前面那一格：进度「2/4」/ 出好了没看的小点。 */
  badge?: ReactNode
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
}

export interface ShellHistoryBucket {
  id: DayBucket
  items: ShellHistoryItem[]
  /** 行右边那枚时间：今天 / 昨天写钟点，更早写月日。 */
  timeLabel(iso: string): string
}

/**
 * 按今天 / 昨天 / 更早分组（列表已按时间倒序）。下拉和框里那一列（用户 10-26）同一份，⛔ 各算各的。
 * 日差按本地零点算（23:50 和次日 00:10 是两天）。
 */
export function useShellHistoryBuckets(
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
 * 行就是标题 ▾ 历史那一套（`StudioOperatorSessionRow` 的 `compact`）：就地改名、删除两段确认；
 * 同一列表同时只有一行举着刀，所以确认态住在这里。
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
}: ShellHistoryMenuProps) {
  const t = useTranslations('StudioShell')
  const [open, setOpen] = useState(false)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const cancelConfirm = useCallback(() => setConfirmId(null), [])

  const buckets = useShellHistoryBuckets(items)

  return (
    <DropdownMenu
      modal={false}
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setConfirmId(null)
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
        className="max-h-[70svh] w-64 overflow-y-auto rounded-xl p-1.5"
      >
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
                badge={item.badge}
                domainLabel={null}
                dateLabel={bucket.timeLabel(item.updatedAt)}
                current={item.id === currentId}
                selectDisabled={
                  deletingId === item.id || (selectDisabled?.(item.id) ?? false)
                }
                deleteDisabled={
                  deletingId !== null || (deleteDisabled?.(item.id) ?? false)
                }
                renaming={renamingId === item.id}
                deleting={deletingId === item.id}
                confirming={confirmId === item.id}
                onSelect={() => onSelect(item.id)}
                onRename={(title) => onRename(item.id, title)}
                onRequestDelete={() => setConfirmId(item.id)}
                onCancelDelete={cancelConfirm}
                onConfirmDelete={() => {
                  void onDelete(item.id).then((deleted) => {
                    if (deleted) setConfirmId(null)
                  })
                }}
              />
            ))}
          </div>
        ))}
        {error ? (
          <p className="px-2.25 py-2 text-2sm text-destructive">{error}</p>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
