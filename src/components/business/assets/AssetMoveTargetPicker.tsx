'use client'

import { useMemo, useState } from 'react'
import { ArrowLeft, Folder, FolderPlus, Search } from 'lucide-react'
import { useTranslations } from 'next-intl'

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { getFolderPath } from '@/lib/folder-tree'
import { cn } from '@/lib/utils'
import type { ProjectRecord } from '@/types'

/**
 * 「移动到文件夹」目标选择器 —— `docs/references/pages/assets.md` §7.2。
 *
 * 现状是 `projects.map` 平铺成 `DropdownMenuItem`：**无搜索、无嵌套、无最近
 * 用过、无新建**，16 个夹已经要滚，100 个不可用。这里按契约给五段：
 *
 * 1. 搜索框（跨层级，子夹带父路径）
 * 2. **最近移入过** 3 个（localStorage）
 * 3. **移出** —— 「未分类」单独一组，← 出箭头图标，避免和普通夹混在一起
 * 4. **全部文件夹**
 * 5. 底部 **+ 新建文件夹并移入…**（搜不到时的唯一出路）
 */

const RECENT_MOVE_TARGETS_KEY = 'pv:assets:recent-move-targets'
const MAX_RECENT_TARGETS = 3

export function readRecentMoveTargets(): string[] {
  try {
    const raw = window.localStorage.getItem(RECENT_MOVE_TARGETS_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed)
      ? parsed.filter((id): id is string => typeof id === 'string')
      : []
  } catch {
    return []
  }
}

export function rememberMoveTarget(projectId: string | null): void {
  if (!projectId) return
  try {
    const next = [
      projectId,
      ...readRecentMoveTargets().filter((id) => id !== projectId),
    ].slice(0, MAX_RECENT_TARGETS)
    window.localStorage.setItem(RECENT_MOVE_TARGETS_KEY, JSON.stringify(next))
  } catch {
    // localStorage unavailable — 最近用过只是加速路径，丢了不影响功能。
  }
}

interface AssetMoveTargetPickerProps {
  trigger: React.ReactNode
  projects: ProjectRecord[]
  onMove: (projectId: string | null) => void
  onCreateAndMove: () => void
}

export function AssetMoveTargetPicker({
  trigger,
  projects,
  onMove,
  onCreateAndMove,
}: AssetMoveTargetPickerProps) {
  const t = useTranslations('AssetsPage')
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const recentIds = useMemo(() => (open ? readRecentMoveTargets() : []), [open])
  const q = query.trim().toLowerCase()
  const matches = q
    ? projects.filter((project) => project.name.toLowerCase().includes(q))
    : projects
  const recent = recentIds
    .map((id) => projects.find((project) => project.id === id))
    .filter((project): project is ProjectRecord => Boolean(project))

  const pathOf = (project: ProjectRecord) => {
    const path = getFolderPath(projects, project.id)
    return path
      .slice(0, -1)
      .map((entry) => entry.name)
      .join(' / ')
  }

  const pick = (projectId: string | null) => {
    setOpen(false)
    setQuery('')
    onMove(projectId)
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setQuery('')
      }}
    >
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="center" side="top" className="w-72 p-1">
        <div className="relative mb-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('folderSearch')}
            aria-label={t('folderSearch')}
            className="h-8 w-full rounded-md border border-border bg-background pl-8 pr-2 text-base md:text-xs text-foreground outline-none focus-visible:border-foreground/40"
          />
        </div>

        <div className="studio-scrollbar max-h-72 overflow-y-auto">
          {!q && recent.length > 0 && (
            <>
              <p className="px-2 pb-1 pt-1.5 text-2xs font-medium uppercase tracking-wide text-muted-foreground">
                {t('moveRecentGroup')}
              </p>
              {recent.map((project) => (
                <MoveTargetRow
                  key={`recent-${project.id}`}
                  label={project.name}
                  path={pathOf(project)}
                  onSelect={() => pick(project.id)}
                />
              ))}
            </>
          )}

          {!q && (
            <>
              <p className="px-2 pb-1 pt-1.5 text-2xs font-medium uppercase tracking-wide text-muted-foreground">
                {t('moveOutGroup')}
              </p>
              <MoveTargetRow
                icon={<ArrowLeft className="size-3.5 shrink-0" />}
                label={t('bulkMoveUnassigned')}
                onSelect={() => pick(null)}
              />
            </>
          )}

          <p className="px-2 pb-1 pt-1.5 text-2xs font-medium uppercase tracking-wide text-muted-foreground">
            {t('sidebarFolders')}
          </p>
          {matches.length === 0 ? (
            <p className="px-2 py-3 text-center text-xs text-muted-foreground">
              {t('folderSearchEmpty')}
            </p>
          ) : (
            matches.map((project) => (
              <MoveTargetRow
                key={project.id}
                label={project.name}
                path={pathOf(project)}
                onSelect={() => pick(project.id)}
              />
            ))
          )}
        </div>

        {/* 搜不到时的唯一出路 —— 现状根本没有这一条。 */}
        <button
          type="button"
          onClick={() => {
            setOpen(false)
            setQuery('')
            onCreateAndMove()
          }}
          className="mt-1 flex h-8 w-full items-center gap-2 rounded-md border-t border-border px-2 text-left text-xs text-foreground transition-colors hover:bg-muted"
        >
          <FolderPlus className="size-3.5 shrink-0 text-muted-foreground" />
          {t('moveCreateAndMove')}
        </button>
      </PopoverContent>
    </Popover>
  )
}

function MoveTargetRow({
  icon,
  label,
  path,
  onSelect,
}: {
  icon?: React.ReactNode
  label: string
  path?: string
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-xs text-foreground transition-colors hover:bg-muted',
      )}
    >
      {icon ?? <Folder className="size-3.5 shrink-0 text-muted-foreground" />}
      <span className="min-w-0 truncate">{label}</span>
      {path && (
        <span className="min-w-0 truncate text-2xs text-muted-foreground">
          {path}
        </span>
      )}
    </button>
  )
}
