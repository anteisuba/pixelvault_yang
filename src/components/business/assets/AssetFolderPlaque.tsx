'use client'

import { useState } from 'react'
import {
  Folder,
  FolderX,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react'
import { useTranslations } from 'next-intl'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { readDroppedAssetIds } from '@/lib/asset-dnd'

import {
  FOLDER_PLAQUE_MAX_SUBFOLDER_CHIPS,
  PLAQUE_COVER_HEIGHT,
  PROJECT_COVER_TILE_COUNT,
} from '@/constants/assets-grid'
import { cn } from '@/lib/utils'
import type { ProjectRecord } from '@/types'

/**
 * 文件夹门牌卡 —— `docs/references/pages/assets.md` §3 段一 / §4。
 *
 * 「把目录项变成有脸的馆藏入口」是本页三个标志性组件之一：
 * **最近 4 张真实素材拼贴（2×2）+ 夹名 + 计数 + 子夹 chips**。
 *
 * 三条路径里的第一条就长在这张卡上：**父夹门牌直接列子夹 chip，点一步进子夹**
 * （超过 2 个折叠成 `+N`，点 `+N` 进父夹看全部）。
 */

interface AssetFolderPlaqueProps {
  /** `null` = 「未分类」那张 —— 它是待办队列，不是普通文件夹。 */
  project: ProjectRecord | null
  /** 屏上账本数（跟随当前类型口径），缺省回落到 `project.generationCount`。 */
  count?: number
  /** 子夹（只用于 chips 行）。 */
  subfolders?: ProjectRecord[]
  /** 「未分类」卡的拼贴素材 —— 它没有 ProjectRecord，封面由调用方给。 */
  coverUrls?: string[]
  active?: boolean
  onOpen: () => void
  onOpenSubfolder?: (projectId: string) => void
  /** 拖素材到门牌 = 归档到该夹（`null` = 移出到未分类）。 */
  onDropAssets?: (assetIds: string[]) => void
  /** 拖门牌进门牌 = 变子夹（总览页才开）。 */
  draggable?: boolean
  onDragStartFolder?: (event: React.DragEvent<HTMLDivElement>) => void
  onDropFolder?: (event: React.DragEvent<HTMLDivElement>) => void
  /**
   * 重命名 / 删除 —— **只在文件夹总览页给**（page §4 治理 2：夹的 CRUD 收在
   * 那一页）。首页段一那行门牌是导航，不是管理面板。
   */
  onRename?: (projectId: string, name: string) => Promise<boolean>
  onRequestDelete?: (projectId: string, name: string) => void
  className?: string
  style?: React.CSSProperties
}

export function AssetFolderPlaque({
  project,
  count,
  subfolders = [],
  coverUrls,
  active = false,
  onOpen,
  onOpenSubfolder,
  onDropAssets,
  draggable = false,
  onDragStartFolder,
  onDropFolder,
  onRename,
  onRequestDelete,
  className,
  style,
}: AssetFolderPlaqueProps) {
  const t = useTranslations('AssetsPage')
  const [isDropTarget, setIsDropTarget] = useState(false)
  const [renameDraft, setRenameDraft] = useState<string | null>(null)
  const isUnassigned = project === null
  const covers = (coverUrls ?? project?.coverUrls ?? []).slice(
    0,
    PROJECT_COVER_TILE_COUNT,
  )
  const total = count ?? project?.generationCount ?? 0
  const visibleSubfolders = subfolders.slice(
    0,
    FOLDER_PLAQUE_MAX_SUBFOLDER_CHIPS,
  )
  const hiddenSubfolderCount = subfolders.length - visibleSubfolders.length

  return (
    <div
      role="group"
      style={style}
      draggable={draggable}
      onDragStart={onDragStartFolder}
      onDragOver={
        onDropAssets || onDropFolder
          ? (event) => {
              event.preventDefault()
              event.dataTransfer.dropEffect = 'move'
              if (!isDropTarget) setIsDropTarget(true)
            }
          : undefined
      }
      onDragLeave={() => setIsDropTarget(false)}
      onDrop={(event) => {
        setIsDropTarget(false)
        // 同一张门牌上可能落下两种东西：素材（归档）或另一张门牌（变子夹）。
        const assetIds = readDroppedAssetIds(event)
        if (assetIds && onDropAssets) {
          event.preventDefault()
          onDropAssets(assetIds)
          return
        }
        onDropFolder?.(event)
      }}
      className={cn(
        'group/plaque relative flex shrink-0 flex-col overflow-hidden rounded-xl border bg-card transition-colors',
        isDropTarget
          ? 'border-foreground ring-2 ring-foreground/15'
          : active
            ? 'border-foreground/40'
            : 'border-border hover:border-border-strong',
        className,
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        aria-label={isUnassigned ? t('sidebarUnassigned') : project.name}
        className="flex flex-1 flex-col text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        {/* 2×2 拼贴。⚠ 高度必须**写死**：①只给 `grid-rows-2` 时行高被图片的
            自然高度撑开，同一行门牌高矮不齐；②改成按比例又会随卡宽膨胀（卡是
            flex-grow 的，夹一少就成了 740×370 的横幅）。两种都实拍见过。
            尺寸走内联 style —— Hard Rule 5 禁 Tailwind 任意值。 */}
        <span
          style={{ height: PLAQUE_COVER_HEIGHT }}
          className="relative grid w-full shrink-0 grid-cols-2 grid-rows-2 gap-px overflow-hidden bg-border"
        >
          {Array.from({ length: PROJECT_COVER_TILE_COUNT }).map((_, index) =>
            covers[index] ? (
              // eslint-disable-next-line @next/next/no-img-element -- CDN covers, and next/image is globally unoptimized here anyway.
              <img
                key={index}
                src={covers[index]}
                alt=""
                loading="lazy"
                className="size-full min-h-0 bg-muted object-cover"
              />
            ) : (
              <span key={index} className="size-full min-h-0 bg-muted" />
            ),
          )}
          {isUnassigned && (
            <span className="absolute left-1.5 top-1.5 flex items-center gap-1 rounded-md bg-status-warning-surface px-1.5 py-0.5 text-3xs font-medium text-status-warning">
              <FolderX className="size-2.5" />
              {t('sidebarUnassignedHint')}
            </span>
          )}
        </span>

        <span className="flex min-w-0 items-baseline gap-1.5 px-2.5 pb-1.5 pt-2">
          <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
            {isUnassigned ? t('sidebarUnassigned') : project.name}
          </span>
          <span className="text-soft-count shrink-0 text-2xs">{total}</span>
        </span>
      </button>

      {/* 总览页才有的夹管理：重命名走行内输入，删除交给页面的 AlertDialog。 */}
      {project && (onRename || onRequestDelete) && (
        <>
          {renameDraft !== null ? (
            <form
              className="px-2.5 pb-2"
              onSubmit={(event) => {
                event.preventDefault()
                const next = renameDraft.trim()
                if (!next || next === project.name) {
                  setRenameDraft(null)
                  return
                }
                void onRename?.(project.id, next).then((ok) => {
                  if (ok) setRenameDraft(null)
                })
              }}
            >
              <input
                autoFocus
                value={renameDraft}
                aria-label={t('folderRenameInput')}
                onChange={(event) => setRenameDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    event.stopPropagation()
                    setRenameDraft(null)
                  }
                }}
                onBlur={() => setRenameDraft(null)}
                className="h-7 w-full rounded-md border border-border bg-background px-2 text-xs text-foreground outline-none focus-visible:border-foreground/40"
              />
            </form>
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label={project.name}
                  className="absolute right-1.5 top-1.5 flex size-6 items-center justify-center rounded-md bg-background/85 text-muted-foreground opacity-0 backdrop-blur-sm transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover/plaque:opacity-100"
                >
                  <MoreHorizontal className="size-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {onRename && (
                  <DropdownMenuItem
                    onClick={() => setRenameDraft(project.name)}
                  >
                    <Pencil className="size-4" />
                    {t('folderRename')}
                  </DropdownMenuItem>
                )}
                {onRequestDelete && (
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => onRequestDelete(project.id, project.name)}
                  >
                    <Trash2 className="size-4" />
                    {t('folderDelete')}
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </>
      )}

      {/* 路径一：子夹 chip 直达，1 击进子夹。超出的折叠成 `+N`，点它进父夹。 */}
      {visibleSubfolders.length > 0 && (
        <span className="flex flex-wrap items-center gap-1 px-2.5 pb-2">
          {visibleSubfolders.map((child) => (
            <button
              key={child.id}
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                onOpenSubfolder?.(child.id)
              }}
              className="inline-flex h-5 max-w-24 items-center gap-1 rounded-md border border-border px-1.5 text-3xs text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground"
            >
              <Folder className="size-2.5 shrink-0" />
              <span className="truncate">{child.name}</span>
            </button>
          ))}
          {hiddenSubfolderCount > 0 && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                onOpen()
              }}
              className="inline-flex h-5 items-center rounded-md border border-border px-1.5 text-3xs text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground"
            >
              {t('folderMoreCount', { count: hiddenSubfolderCount })}
            </button>
          )}
        </span>
      )}
    </div>
  )
}

interface AssetFolderPlaqueActionProps {
  kind: 'all' | 'create'
  /** `+N 查看全部` 的 N。 */
  hiddenCount?: number
  onClick: () => void
  className?: string
  style?: React.CSSProperties
}

/**
 * 门牌行末尾固定预留的两张：「+N 查看全部」与「新建文件夹」。
 * 它们和真门牌同宽同高，一起参与 flex-grow，所以**这一行永远铺满，右侧不留空白**。
 */
export function AssetFolderPlaqueAction({
  kind,
  hiddenCount = 0,
  onClick,
  className,
  style,
}: AssetFolderPlaqueActionProps) {
  const t = useTranslations('AssetsPage')
  return (
    <button
      type="button"
      onClick={onClick}
      style={style}
      className={cn(
        'flex shrink-0 flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-border text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
        className,
      )}
    >
      {kind === 'create' ? (
        <Plus className="size-4" />
      ) : (
        <Folder className="size-4" />
      )}
      <span className="px-2 text-center text-2xs font-medium">
        {kind === 'create' ? t('folderCreate') : t('folderViewAll')}
        {kind === 'all' && hiddenCount > 0 && (
          <span className="text-soft-count ml-1">
            {t('folderMoreCount', { count: hiddenCount })}
          </span>
        )}
      </span>
    </button>
  )
}
