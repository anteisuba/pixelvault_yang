'use client'

import { useMemo, useState } from 'react'
import { ArrowUpDown, Search } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { FOLDER_DND_MIME } from '@/constants/asset-dnd'
import { FOLDER_PLAQUE_GAP, FOLDER_PLAQUE_WIDTH } from '@/constants/assets-grid'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  filterFolders,
  FOLDER_SORT_MODES,
  getChildFolders,
  sortFolders,
  type FolderSortMode,
} from '@/lib/folder-tree'
import { cn } from '@/lib/utils'
import type { ProjectRecord } from '@/types'

import {
  AssetFolderPlaque,
  AssetFolderPlaqueAction,
} from '@/components/business/assets/AssetFolderPlaque'

/**
 * 文件夹总览页 —— `docs/references/pages/assets.md` §4「治理 2」。
 *
 * 夹的专属管理页：**跨层级搜索 · 三档排序 · 新建 · 拖素材到门牌归档 ·
 * 拖门牌进门牌变子夹**。首页那一行只放头部，全部都在这里，所以夹从 16 涨到
 * 100 时首页长度不变。
 *
 * ⛔ 这里**不做 pin 置顶**（page §4.2 / 切片 4c）—— 它要加 `Project.pinnedOrder`
 * 列，属第二批。
 */

interface AssetFolderOverviewProps {
  projects: ProjectRecord[]
  sortMode: FolderSortMode
  onSortModeChange: (mode: FolderSortMode) => void
  countFor: (projectId: string) => number | undefined
  unassignedCount?: number
  activeProjectId: string | null
  onOpenFolder: (projectId: string) => void
  onOpenUnassigned: () => void
  onCreateFolder: () => void
  onDropAssets: (projectId: string | null, assetIds: string[]) => void
  /** 拖门牌进门牌 = 变子夹；`parentId` 为 null 表示拖到「未分类」= 升为顶层。 */
  onMoveFolder: (folderId: string, parentId: string | null) => void
  onRenameFolder: (projectId: string, name: string) => Promise<boolean>
  onRequestDeleteFolder: (projectId: string, name: string) => void
  className?: string
}

export function AssetFolderOverview({
  projects,
  sortMode,
  onSortModeChange,
  countFor,
  unassignedCount,
  activeProjectId,
  onOpenFolder,
  onOpenUnassigned,
  onCreateFolder,
  onDropAssets,
  onMoveFolder,
  onRenameFolder,
  onRequestDeleteFolder,
  className,
}: AssetFolderOverviewProps) {
  const t = useTranslations('AssetsPage')
  const [query, setQuery] = useState('')

  const visible = useMemo(
    () => sortFolders(filterFolders(projects, query), sortMode, countFor),
    [projects, query, sortMode, countFor],
  )

  const sortLabels: Record<FolderSortMode, string> = {
    recent: t('folderSortRecent'),
    name: t('folderSortName'),
    count: t('folderSortCount'),
  }

  return (
    <div className={cn('grid gap-3', className)}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('folderSearch')}
            aria-label={t('folderSearch')}
            className="h-8 w-full rounded-lg border border-border bg-background pl-8 pr-2 text-xs text-foreground outline-none transition-colors placeholder:text-muted-foreground hover:border-border-strong focus-visible:border-foreground/40 focus-visible:ring-2 focus-visible:ring-ring/30"
          />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground"
            >
              <ArrowUpDown className="size-3.5" />
              {sortLabels[sortMode]}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {FOLDER_SORT_MODES.map((mode) => (
              <DropdownMenuItem
                key={mode}
                onClick={() => onSortModeChange(mode)}
              >
                {sortLabels[mode]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div
        className="grid"
        style={{
          gap: FOLDER_PLAQUE_GAP,
          gridTemplateColumns: `repeat(auto-fill, minmax(${FOLDER_PLAQUE_WIDTH}px, 1fr))`,
        }}
      >
        {!query && (
          <AssetFolderPlaque
            project={null}
            count={unassignedCount}
            onOpen={onOpenUnassigned}
            onDropAssets={(ids) => onDropAssets(null, ids)}
            onDropFolder={(event) => {
              const folderId = event.dataTransfer.getData(FOLDER_DND_MIME)
              if (folderId) onMoveFolder(folderId, null)
            }}
          />
        )}
        {visible.map((project) => (
          <AssetFolderPlaque
            key={project.id}
            project={project}
            count={countFor(project.id)}
            subfolders={getChildFolders(projects, project.id)}
            active={activeProjectId === project.id}
            onOpen={() => onOpenFolder(project.id)}
            onOpenSubfolder={onOpenFolder}
            onDropAssets={(ids) => onDropAssets(project.id, ids)}
            onRename={onRenameFolder}
            onRequestDelete={onRequestDeleteFolder}
            draggable
            onDragStartFolder={(event) => {
              event.dataTransfer.setData(FOLDER_DND_MIME, project.id)
              event.dataTransfer.effectAllowed = 'move'
            }}
            onDropFolder={(event) => {
              const folderId = event.dataTransfer.getData(FOLDER_DND_MIME)
              // 拖到自己身上没有意义；更深的环（拖父夹进自己的子夹）由
              // service 的 `resolveProjectParentId` 兜底拒绝。
              if (folderId && folderId !== project.id) {
                onMoveFolder(folderId, project.id)
              }
            }}
          />
        ))}
        {!query && (
          <AssetFolderPlaqueAction kind="create" onClick={onCreateFolder} />
        )}
        {query && visible.length === 0 && (
          <p className="col-span-full py-8 text-center text-xs text-muted-foreground">
            {t('folderSearchEmpty')}
          </p>
        )}
      </div>
    </div>
  )
}
