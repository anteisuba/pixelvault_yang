'use client'

import {
  AlertCircle,
  Check,
  FolderInput,
  Music2,
  RotateCcw,
  X,
} from 'lucide-react'
import { useTranslations } from 'next-intl'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { UploadQueueItem } from '@/hooks/use-asset-upload-queue'
import { cn } from '@/lib/utils'
import type { ProjectRecord } from '@/types'

/**
 * 上传队列面板 —— `docs/references/pages/assets.md` §7「上传队列」。
 *
 * 右下常驻（手机贴底通栏）：标题 + `N 项 · N 完成 · N 失败` + **落夹目标可改**
 * + 逐项（缩略图 / 文件名 / 进度条 / 结果）+ 失败项行内「重试」+ 底部
 * 「全部重试 / 清除已完成」。⛔ 不再只用一个全局 `isUploading` + toast。
 */

interface AssetUploadQueuePanelProps {
  items: UploadQueueItem[]
  doneCount: number
  errorCount: number
  projects: ProjectRecord[]
  /** 队列当前的落夹目标（取第一项未完成的）。 */
  targetProjectId: string | null
  onChangeTarget: (projectId: string | null) => void
  onRetry: (id: string) => void
  onRetryAll: () => void
  onRemove: (id: string) => void
  onClearCompleted: () => void
  /** 完成项点「查看」—— 跳到它所在的范围。 */
  onReveal: (item: UploadQueueItem) => void
  className?: string
}

export function AssetUploadQueuePanel({
  items,
  doneCount,
  errorCount,
  projects,
  targetProjectId,
  onChangeTarget,
  onRetry,
  onRetryAll,
  onRemove,
  onClearCompleted,
  onReveal,
  className,
}: AssetUploadQueuePanelProps) {
  const t = useTranslations('AssetsPage')
  if (items.length === 0) return null

  const targetName =
    projects.find((project) => project.id === targetProjectId)?.name ??
    t('sidebarUnassigned')
  const hasPending = items.some((item) => item.status !== 'done')

  return (
    <section
      aria-label={t('uploadQueueTitle')}
      className={cn(
        'fixed bottom-0 right-0 z-40 w-full border-t border-border bg-popover shadow-lg sm:bottom-4 sm:right-4 sm:w-80 sm:rounded-xl sm:border',
        className,
      )}
    >
      <header className="flex items-center gap-2 border-b border-border px-3 py-2">
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
          {t('uploadQueueTitle')}
        </span>
        <span className="text-soft-count shrink-0 text-2xs">
          {t('uploadQueueSummary', {
            total: items.length,
            done: doneCount,
            failed: errorCount,
          })}
        </span>
      </header>

      {/* 落夹目标可改 —— 只影响还没开传的项（传完的那是「移动」，不是这里的事）。 */}
      {hasPending && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex w-full items-center gap-1.5 border-b border-border px-3 py-1.5 text-2xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <FolderInput className="size-3 shrink-0" />
              <span className="min-w-0 truncate">
                {t('uploadQueueTarget', { folder: targetName })}
              </span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className="max-h-64 overflow-y-auto"
          >
            <DropdownMenuItem onClick={() => onChangeTarget(null)}>
              {t('sidebarUnassigned')}
            </DropdownMenuItem>
            {projects.length > 0 && <DropdownMenuSeparator />}
            {projects.map((project) => (
              <DropdownMenuItem
                key={project.id}
                onClick={() => onChangeTarget(project.id)}
              >
                <span className="truncate">{project.name}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <ul className="studio-scrollbar max-h-56 overflow-y-auto">
        {items.map((item) => (
          <li
            key={item.id}
            className="flex items-center gap-2 px-3 py-1.5 text-2xs"
          >
            {item.mimeType.startsWith('audio/') ? (
              <span className="flex size-7 shrink-0 items-center justify-center rounded-md border border-border bg-muted">
                <Music2 className="size-3.5 text-muted-foreground" />
              </span>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element -- local object URL
              <img
                src={item.previewUrl}
                alt=""
                className="size-7 shrink-0 rounded-md border border-border object-cover"
              />
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-foreground">
                {item.fileName}
              </span>
              {item.status === 'uploading' && (
                <span className="mt-0.5 block h-1 w-full overflow-hidden rounded-full bg-muted">
                  <span
                    className="block h-full rounded-full bg-foreground transition-[width] duration-200"
                    style={{ width: `${item.progress}%` }}
                  />
                </span>
              )}
              {item.status === 'error' && (
                <span className="block truncate text-destructive">
                  {item.error ?? t('uploadFailed')}
                </span>
              )}
            </span>
            {item.status === 'uploading' && (
              <span className="text-soft-count shrink-0">{item.progress}%</span>
            )}
            {item.status === 'done' && (
              <button
                type="button"
                onClick={() => onReveal(item)}
                className="flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-muted-foreground transition-colors hover:text-foreground"
              >
                <Check className="size-3" />
                {t('uploadQueueReveal')}
              </button>
            )}
            {item.status === 'error' && (
              <button
                type="button"
                onClick={() => onRetry(item.id)}
                aria-label={t('uploadQueueRetry')}
                className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground"
              >
                <RotateCcw className="size-3" />
              </button>
            )}
            <button
              type="button"
              onClick={() => onRemove(item.id)}
              aria-label={t('uploadQueueRemove')}
              className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground"
            >
              <X className="size-3" />
            </button>
          </li>
        ))}
      </ul>

      <footer className="flex items-center gap-2 border-t border-border px-3 py-1.5">
        {errorCount > 0 && (
          <button
            type="button"
            onClick={onRetryAll}
            className="flex items-center gap-1 text-2xs text-destructive transition-opacity hover:opacity-80"
          >
            <AlertCircle className="size-3" />
            {t('uploadQueueRetryAll')}
          </button>
        )}
        {doneCount > 0 && (
          <button
            type="button"
            onClick={onClearCompleted}
            className="ml-auto text-2xs text-muted-foreground transition-colors hover:text-foreground"
          >
            {t('uploadQueueClearDone')}
          </button>
        )}
      </footer>
    </section>
  )
}
