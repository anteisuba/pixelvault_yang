'use client'

import { useTranslations } from 'next-intl'

import {
  FolderInput,
  FolderPlus,
  Pencil,
  Pin,
  Trash2,
} from '@/components/icons'
import { folderIndentPx, getFolderMoveTargets } from '@/lib/folder-tree'
import { cn } from '@/lib/utils'
import type { ProjectRecord } from '@/types'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
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
  /** 受控打开（左栏那一行右键 / 长按也要打开同一个菜单）；不给 = 只由键开关。 */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /** 「改名」后面写 F2（只有左栏那一行认 F2；段头改的是标题，不认）。 */
  showRenameShortcut?: boolean
}

/**
 * 一个夹的 ⋯ 菜单（画板 `AfB_Menu`）：改名 · 置顶 · 新建子文件夹 · 移到… · 删除。
 * 左栏那一行和段头用的是同一个，从键长出来（与标签模板「使用」同一颗弹层动效）；
 * 左栏那一行右键（桌面）/ 长按（触屏）打开的也是它，同样从行尾 ⋯ 长出来。
 *
 * 层数不限：每一层的夹都有「新建子文件夹」；「移到…」列出整棵树里能去的夹（照树
 * 缩进），除掉它自己、它所有层的子孙（会成环，服务端同样拒）和它现在的父夹。
 */
export function AssetFolderMenu({
  folder,
  folders,
  trigger,
  align = 'start',
  open,
  onOpenChange,
  showRenameShortcut = false,
  onRename,
  onTogglePin,
  onCreateChild,
  onMove,
  onDelete,
}: AssetFolderMenuProps) {
  const t = useTranslations('AssetsPage')
  const zoom = getChipZoomMotion({ side: 'bottom', align, sideOffset: 6 })
  const isTopLevel = folder.parentId === null
  const moveTargets = getFolderMoveTargets(folders, folder)

  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
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
          {showRenameShortcut ? (
            <DropdownMenuShortcut>F2</DropdownMenuShortcut>
          ) : null}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onTogglePin} className="rounded-xl">
          <Pin aria-hidden />
          {folder.pinnedOrder === null ? t('folderPin') : t('folderUnpin')}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onCreateChild} className="rounded-xl">
          <FolderPlus aria-hidden />
          {t('folderCreateChild')}
        </DropdownMenuItem>
        {moveTargets.length > 0 || !isTopLevel ? (
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
              {moveTargets.map(({ folder: target, depth }) => (
                <DropdownMenuItem
                  key={target.id}
                  onSelect={() => onMove(target.id)}
                  className="rounded-xl"
                  // 层深是算出来的数，只能走行内样式（见 FOLDER_TREE_INDENT）。
                  style={{ paddingLeft: folderIndentPx('menu', depth) }}
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
