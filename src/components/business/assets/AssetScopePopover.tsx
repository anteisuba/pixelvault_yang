'use client'

import { useState, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'

import { Check, Folder, FolderX, LayoutGrid } from '@/components/icons'
import { getChipZoomMotion } from '@/components/business/studio-shared/primitives/tool-surface'
import type { AssetFolderScope } from '@/components/business/assets/AssetFolderSidebar'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { staggerDelay } from '@/constants/motion'
import { getChildFolders, getRootFolders } from '@/lib/folder-tree'
import { cn } from '@/lib/utils'
import type { ProjectRecord } from '@/types'

const SCOPE_POPOVER_OFFSET = 6

interface AssetScopePopoverProps {
  folders: ProjectRecord[]
  counts: {
    all?: number
    unassigned?: number
    byProject: Record<string, number>
  }
  scope: AssetFolderScope
  onScopeChange: (scope: AssetFolderScope) => void
  /** 顶栏那颗范围胶囊本身（`asChild` 套上）。 */
  trigger: ReactNode
  /**
   * 点下去时先问一句：返回 `true` = 这次不开弹层（窄屏把文件夹抽屉拿出来）。
   */
  onTriggerIntercept?: () => boolean
}

type ScopeRow = {
  key: string
  scope: AssetFolderScope
  label: string
  count?: number
  depth: 0 | 1
  icon: ReactNode
}

/**
 * 栏收起后顶栏的范围胶囊（素材页原型 Q · 2026-10-08 定稿）：只是「换文件夹」的快捷入口，
 * 点开从胶囊里长出一行一项的文件夹列表（同分面弹层那套行），选一个就换范围、栏保持收着。
 * ⛔ 不在这里把栏打开 —— 左端那颗键才管开关栏。
 */
export function AssetScopePopover({
  folders,
  counts,
  scope,
  onScopeChange,
  trigger,
  onTriggerIntercept,
}: AssetScopePopoverProps) {
  const t = useTranslations('AssetsPage')
  const [open, setOpen] = useState(false)
  const zoom = getChipZoomMotion({
    side: 'bottom',
    align: 'start',
    sideOffset: SCOPE_POPOVER_OFFSET,
  })

  const rows: ScopeRow[] = [
    {
      key: 'all',
      scope: { kind: 'all' },
      label: t('sectionAllAssets'),
      count: counts.all,
      depth: 0,
      icon: <LayoutGrid className="size-3.5" />,
    },
    {
      key: 'unassigned',
      scope: { kind: 'unassigned' },
      label: t('sidebarUnassigned'),
      count: counts.unassigned,
      depth: 0,
      icon: <FolderX className="size-3.5" />,
    },
  ]
  for (const root of getRootFolders(folders)) {
    rows.push(folderRow(root, 0, counts.byProject))
    for (const child of getChildFolders(folders, root.id)) {
      rows.push(folderRow(child, 1, counts.byProject))
    }
  }

  const isActive = (row: ScopeRow) =>
    row.scope.kind === scope.kind &&
    (row.scope.kind !== 'folder' ||
      (scope.kind === 'folder' && scope.id === row.scope.id))

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        asChild
        onClick={(event) => {
          if (onTriggerIntercept?.()) event.preventDefault()
        }}
      >
        {trigger}
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={SCOPE_POPOVER_OFFSET}
        className={cn('w-60 rounded-xl p-1', zoom.className)}
        style={zoom.style}
      >
        <div
          role="listbox"
          aria-label={t('sidebarFolders')}
          className="studio-scrollbar max-h-80 overflow-y-auto"
        >
          {rows.map((row, index) => {
            const active = isActive(row)
            return (
              <button
                key={row.key}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => {
                  onScopeChange(row.scope)
                  setOpen(false)
                }}
                style={{
                  animationDelay: `${Math.round(staggerDelay(index) * 1000 * 0.6)}ms`,
                }}
                className={cn(
                  'picker-row-in flex h-8 w-full items-center gap-2 rounded-lg pr-2 text-left text-xs text-foreground',
                  'transition-colors duration-base ease-standard motion-reduce:transition-none',
                  'hover:outline hover:outline-1 hover:outline-border',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  row.depth === 1 ? 'pl-6.5' : 'pl-2',
                  active && 'bg-muted font-medium',
                )}
              >
                {row.icon}
                <span className="min-w-0 flex-1 truncate">{row.label}</span>
                {typeof row.count === 'number' && (
                  <span className="shrink-0 font-mono text-2xs font-normal text-muted-foreground tabular-nums">
                    {row.count}
                  </span>
                )}
                <Check
                  aria-hidden
                  className={cn(
                    'size-3.5 shrink-0 transition-[opacity,scale,filter] duration-base ease-standard motion-reduce:transition-none',
                    active
                      ? 'scale-100 opacity-100'
                      : 'scale-50 opacity-0 blur-xs',
                  )}
                />
              </button>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function folderRow(
  folder: ProjectRecord,
  depth: 0 | 1,
  byProject: Record<string, number>,
): ScopeRow {
  return {
    key: folder.id,
    scope: { kind: 'folder', id: folder.id },
    label: folder.name,
    count: byProject[folder.id],
    depth,
    icon: folder.coverUrl ? (
      // eslint-disable-next-line @next/next/no-img-element -- R2 缩略图，已是小图
      <img
        src={folder.coverUrl}
        alt=""
        loading="lazy"
        className="size-4.5 shrink-0 rounded-sm object-cover"
      />
    ) : (
      <Folder className="size-3.5 shrink-0 text-muted-foreground" />
    ),
  }
}
