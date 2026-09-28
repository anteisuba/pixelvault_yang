'use client'

import { useTranslations } from 'next-intl'

import {
  FolderInput,
  FolderPlus,
  Pencil,
  Pin,
  Trash2,
} from '@/components/icons'
import { getChildFolders, getRootFolders } from '@/lib/folder-tree'
import { cn } from '@/lib/utils'
import type { ProjectRecord } from '@/types'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { getChipZoomMotion } from '@/components/business/studio-shared/primitives/tool-surface'

export interface AssetFolderMenuActions {
  onRename: () => void
  onTogglePin: () => void
  onCreateChild: () => void
  onMove: (parentId: string | null) => void
  onDelete: () => void
}

interface AssetFolderMenuProps extends AssetFolderMenuActions {
  folder: ProjectRecord
  folders: ProjectRecord[]
  trigger: React.ReactNode
  align?: 'start' | 'end'
  onOpenChange?: (open: boolean) => void
}

/**
 * 一个夹的 ⋯ 菜单（画板 `AfB_Menu`）：改名 · 置顶 · 新建子文件夹 · 移到… · 删除。
 * 左栏那一行和段头用的是同一个，从键长出来（与标签模板「使用」同一颗弹层动效）。
 *
 * ⚠ 只有两层：「新建子文件夹」只在最外层的夹上；有子夹的夹没有「移到…」。
 */
export function AssetFolderMenu({
  folder,
  folders,
  trigger,
  align = 'start',
  onOpenChange,
  onRename,
  onTogglePin,
  onCreateChild,
  onMove,
  onDelete,
}: AssetFolderMenuProps) {
  const t = useTranslations('AssetsPage')
  const zoom = getChipZoomMotion({ side: 'bottom', align, sideOffset: 6 })
  const isTopLevel = folder.parentId === null
  const hasChildren = getChildFolders(folders, folder.id).length > 0
  const moveTargets = getRootFolders(folders).filter(
    (target) => target.id !== folder.id && target.id !== folder.parentId,
  )

  return (
    <DropdownMenu onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent
        align={align}
        sideOffset={6}
        aria-label={t('folderMenu')}
        className={cn('w-50 rounded-2xl p-1.5', zoom.className)}
        style={zoom.style}
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <DropdownMenuItem onSelect={onRename} className="rounded-xl">
          <Pencil aria-hidden />
          {t('folderRename')}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onTogglePin} className="rounded-xl">
          <Pin aria-hidden />
          {folder.pinnedOrder === null ? t('folderPin') : t('folderUnpin')}
        </DropdownMenuItem>
        {isTopLevel ? (
          <DropdownMenuItem onSelect={onCreateChild} className="rounded-xl">
            <FolderPlus aria-hidden />
            {t('folderCreateChild')}
          </DropdownMenuItem>
        ) : null}
        {!hasChildren && (moveTargets.length > 0 || !isTopLevel) ? (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="rounded-xl">
              <FolderInput aria-hidden />
              {t('folderMoveTo')}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="max-h-80 w-50 overflow-y-auto rounded-2xl p-1.5">
              {!isTopLevel ? (
                <DropdownMenuItem
                  onSelect={() => onMove(null)}
                  className="rounded-xl"
                >
                  {t('folderMoveToTop')}
                </DropdownMenuItem>
              ) : null}
              {moveTargets.map((target) => (
                <DropdownMenuItem
                  key={target.id}
                  onSelect={() => onMove(target.id)}
                  className="rounded-xl"
                >
                  <span className="truncate">{target.name}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onSelect={onDelete}
          className="rounded-xl"
        >
          <Trash2 aria-hidden />
          {t('folderDelete')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
