'use client'

import { useMemo } from 'react'

import {
  ASSET_GRID_TABLET_MIN_WIDTH,
  FOLDER_PLAQUE_GAP,
  FOLDER_PLAQUE_MOBILE_WIDTH,
  FOLDER_PLAQUE_WIDTH,
} from '@/constants/assets-grid'
import { useContainerWidth } from '@/hooks/use-justified-grid'
import {
  getChildFolders,
  getRootFolders,
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
 * 段一 · 文件夹门牌行 —— `docs/references/pages/assets.md` §3。
 *
 * - 「未分类」永远是第一张（它是**待办队列**，不是普通文件夹）。
 * - 横向一行，**按容器宽自适应张数**：`fit = ⌊(W + gap) / (卡宽 + gap)⌋`，
 *   末尾固定预留「+N 查看全部」与「新建文件夹」两张，卡片 `flex-grow` 吃掉余量
 *   —— **永远铺满一行，右侧不留空白**。
 * - 治理 1：夹从 16 涨到 100，**首页长度不变** —— 多出来的都收进 `+N`。
 */

interface AssetFolderRailProps {
  /** 全部夹（含子夹）—— 用来算子夹 chips 与 `+N` 的隐藏数。 */
  projects: ProjectRecord[]
  /**
   * 这一行要摆哪些门牌。缺省 = 顶层夹（首页段一）；
   * 夹内页传的是**该夹的子夹**（page §4 路径二：子夹小门牌置顶）。
   */
  folders?: ProjectRecord[]
  sortMode: FolderSortMode
  /** 夹内页的子夹行不挂「未分类」，也不挂「+N 查看全部」。 */
  showUnassigned?: boolean
  showViewAll?: boolean
  unassignedCount?: number
  /** 「未分类」那张卡的拼贴 —— 它不是 Project，封面由调用方从列表里凑。 */
  unassignedCovers?: string[]
  countFor: (projectId: string) => number | undefined
  activeProjectId: string | null
  isUnassignedActive?: boolean
  onOpenFolder: (projectId: string) => void
  onOpenUnassigned?: () => void
  onOpenOverview?: () => void
  onCreateFolder: () => void
  onDropAssets: (projectId: string | null, assetIds: string[]) => void
  className?: string
}

export function AssetFolderRail({
  projects,
  folders,
  sortMode,
  showUnassigned = true,
  showViewAll = true,
  unassignedCount,
  unassignedCovers,
  countFor,
  activeProjectId,
  isUnassignedActive = false,
  onOpenFolder,
  onOpenUnassigned,
  onOpenOverview,
  onCreateFolder,
  onDropAssets,
  className,
}: AssetFolderRailProps) {
  const { containerRef, containerWidth } = useContainerWidth()

  const source = folders ?? getRootFolders(projects)
  const sorted = useMemo(
    () => sortFolders(source, sortMode, countFor),
    [source, sortMode, countFor],
  )

  // <768 手机：一行装不下自适应张数，改成固定宽横滚（page §9）。
  const isNarrow = containerWidth < ASSET_GRID_TABLET_MIN_WIDTH
  const plaqueWidth = isNarrow
    ? FOLDER_PLAQUE_MOBILE_WIDTH
    : FOLDER_PLAQUE_WIDTH

  // 一行能站几张（含末尾固定位）。至少给 1 张真门牌留位置，否则窄容器下
  // 整行只剩「查看全部 / 新建」两个按钮，等于没有门牌。
  const reservedSlots = (showViewAll ? 1 : 0) + 1
  const fit = Math.floor(
    (containerWidth + FOLDER_PLAQUE_GAP) / (plaqueWidth + FOLDER_PLAQUE_GAP),
  )
  const plaqueSlots = isNarrow
    ? sorted.length
    : Math.max(1, fit - reservedSlots) - (showUnassigned ? 1 : 0)
  const visibleFolders = sorted.slice(0, Math.max(0, plaqueSlots))
  const hiddenCount = source.length - visibleFolders.length

  const plaqueClass = isNarrow ? 'shrink-0' : 'min-w-0 flex-1'
  const plaqueStyle = isNarrow ? { width: plaqueWidth } : undefined

  return (
    <div
      ref={containerRef}
      className={cn(
        'flex items-stretch',
        isNarrow && '-mx-2 overflow-x-auto px-2',
        className,
      )}
      style={{ gap: FOLDER_PLAQUE_GAP }}
    >
      {showUnassigned && onOpenUnassigned && (
        <AssetFolderPlaque
          project={null}
          count={unassignedCount}
          coverUrls={unassignedCovers}
          active={isUnassignedActive}
          onOpen={onOpenUnassigned}
          onDropAssets={(ids) => onDropAssets(null, ids)}
          className={plaqueClass}
          style={plaqueStyle}
        />
      )}
      {visibleFolders.map((project) => (
        <AssetFolderPlaque
          key={project.id}
          project={project}
          count={countFor(project.id)}
          subfolders={getChildFolders(projects, project.id)}
          active={activeProjectId === project.id}
          onOpen={() => onOpenFolder(project.id)}
          onOpenSubfolder={onOpenFolder}
          onDropAssets={(ids) => onDropAssets(project.id, ids)}
          className={plaqueClass}
          style={plaqueStyle}
        />
      ))}
      {/* ⚠ 「查看全部」是**固定预留位**，不是「有溢出才出现」：夹的重命名/
          删除只在总览页（治理 2），夹少时也必须进得去。 */}
      {showViewAll && onOpenOverview && (
        <AssetFolderPlaqueAction
          kind="all"
          hiddenCount={hiddenCount}
          onClick={onOpenOverview}
          className={plaqueClass}
          style={plaqueStyle}
        />
      )}
      <AssetFolderPlaqueAction
        kind="create"
        onClick={onCreateFolder}
        className={plaqueClass}
        style={plaqueStyle}
      />
    </div>
  )
}
