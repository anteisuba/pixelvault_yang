'use client'

import { useMemo, useState } from 'react'
import {
  ChevronRight,
  Folder,
  FolderX,
  Heart,
  LayoutGrid,
  Search,
} from 'lucide-react'
import { useTranslations } from 'next-intl'

import {
  filterFolders,
  getChildFolders,
  getFolderPath,
  getRootFolders,
} from '@/lib/folder-tree'
import { cn } from '@/lib/utils'
import type { ProjectRecord } from '@/types'

/**
 * picker 的文件夹导航栏 —— `docs/references/pages/assets.md` §8.1。
 *
 * ⚠ **这是钟摆的第三个位置，别再荡回去**：
 * | 形态 | 为什么不行 |
 * | --- | --- |
 * | 280px 竖树 | 吃掉 40% 对话框宽，网格只剩三列，还把管理页的 CRUD 一起搬了进来 |
 * | 横向 chips rail | 一行装不下 16+ 个夹，且**不支持嵌套**（子夹没有位置）—— 正是原始需求 F1 的病本身 |
 *
 * 定案 = **176px 可折叠导航栏**（880 宽对话框里 ≈20%）。与旧竖树的关键差别：
 * **它只装导航，不装管理** —— 没有新建/重命名/删除、没有密度、没有批量动作。
 */

export type PickerScope =
  | { kind: 'all' }
  | { kind: 'favorites' }
  | { kind: 'unassigned' }
  | { kind: 'project'; id: string }

interface AssetPickerFolderNavProps {
  projects: ProjectRecord[]
  scope: PickerScope
  onScopeChange: (scope: PickerScope) => void
  counts?: {
    all?: number
    favorites?: number
    unassigned?: number
    byProject?: Record<string, number>
  }
  /** 最近用过的 3 个夹 id（localStorage，picker 的最高频路径）。 */
  recentProjectIds: string[]
  className?: string
}

export function AssetPickerFolderNav({
  projects,
  scope,
  onScopeChange,
  counts,
  recentProjectIds,
  className,
}: AssetPickerFolderNavProps) {
  const t = useTranslations('AssetsPage')
  const [query, setQuery] = useState('')
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set())

  const q = query.trim()
  // 栏顶搜索：**跨层级扁平命中**，子夹显示父路径。夹一多，这是唯一 O(1) 的路径。
  const flatMatches = useMemo(
    () => (q ? filterFolders(projects, q) : []),
    [projects, q],
  )
  const roots = useMemo(() => getRootFolders(projects), [projects])
  const recent = recentProjectIds
    .map((id) => projects.find((project) => project.id === id))
    .filter((project): project is ProjectRecord => Boolean(project))

  const isActiveProject = (id: string) =>
    scope.kind === 'project' && scope.id === id

  const pathOf = (project: ProjectRecord) =>
    getFolderPath(projects, project.id)
      .slice(0, -1)
      .map((entry) => entry.name)
      .join(' / ')

  const renderTree = (nodes: ProjectRecord[], depth: number): React.ReactNode =>
    nodes.map((project) => {
      const children = getChildFolders(projects, project.id)
      const expanded = expandedIds.has(project.id)
      return (
        <div key={project.id}>
          <NavRow
            depth={depth}
            active={isActiveProject(project.id)}
            label={project.name}
            count={counts?.byProject?.[project.id]}
            icon={<Folder className="size-3.5 shrink-0" />}
            // 点 `▸` 只展开/收起，**不切换范围**；点行本体才切范围。
            onToggle={
              children.length > 0
                ? () =>
                    setExpandedIds((prev) => {
                      const next = new Set(prev)
                      if (next.has(project.id)) next.delete(project.id)
                      else next.add(project.id)
                      return next
                    })
                : undefined
            }
            expanded={expanded}
            onSelect={() => onScopeChange({ kind: 'project', id: project.id })}
          />
          {expanded && children.length > 0 && renderTree(children, depth + 1)}
        </div>
      )
    })

  return (
    <nav
      aria-label={t('sidebarFolders')}
      className={cn(
        'flex min-h-0 shrink-0 flex-col border-r border-border/60',
        className,
      )}
    >
      <div className="relative p-1.5">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-3 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('folderSearch')}
          aria-label={t('folderSearch')}
          className="h-7 w-full rounded-md border border-border/60 bg-background/40 pl-7 pr-1.5 text-2xs text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-foreground/40"
        />
      </div>

      <div className="studio-scrollbar min-h-0 flex-1 overflow-y-auto px-1.5 pb-1.5">
        {q ? (
          flatMatches.length === 0 ? (
            <p className="px-2 py-3 text-center text-2xs text-muted-foreground">
              {t('folderSearchEmpty')}
            </p>
          ) : (
            flatMatches.map((project) => (
              <NavRow
                key={project.id}
                depth={0}
                active={isActiveProject(project.id)}
                label={project.name}
                path={pathOf(project)}
                count={counts?.byProject?.[project.id]}
                icon={<Folder className="size-3.5 shrink-0" />}
                onSelect={() =>
                  onScopeChange({ kind: 'project', id: project.id })
                }
              />
            ))
          )
        ) : (
          <>
            <NavGroupLabel>{t('pickerNavViews')}</NavGroupLabel>
            <NavRow
              depth={0}
              active={scope.kind === 'all'}
              label={t('sidebarAll')}
              count={counts?.all}
              icon={<LayoutGrid className="size-3.5 shrink-0" />}
              onSelect={() => onScopeChange({ kind: 'all' })}
            />
            <NavRow
              depth={0}
              active={scope.kind === 'favorites'}
              label={t('sidebarFavorites')}
              count={counts?.favorites}
              icon={<Heart className="size-3.5 shrink-0" />}
              onSelect={() => onScopeChange({ kind: 'favorites' })}
            />
            {/* `未分类` 只在智能视图出现一次，**不在「全部文件夹」里重复列**
                —— 它是系统集合，不是用户夹。 */}
            <NavRow
              depth={0}
              active={scope.kind === 'unassigned'}
              label={t('sidebarUnassigned')}
              count={counts?.unassigned}
              icon={<FolderX className="size-3.5 shrink-0" />}
              onSelect={() => onScopeChange({ kind: 'unassigned' })}
            />

            {recent.length > 0 && (
              <>
                <NavGroupLabel>{t('pickerNavRecent')}</NavGroupLabel>
                {recent.map((project) => (
                  // 同一个夹同时出现在「最近用过」和树里时，两处同时高亮。
                  <NavRow
                    key={`recent-${project.id}`}
                    depth={0}
                    active={isActiveProject(project.id)}
                    label={project.name}
                    count={counts?.byProject?.[project.id]}
                    icon={<Folder className="size-3.5 shrink-0" />}
                    onSelect={() =>
                      onScopeChange({ kind: 'project', id: project.id })
                    }
                  />
                ))}
              </>
            )}

            {roots.length > 0 && (
              <>
                <NavGroupLabel>{t('sidebarFolders')}</NavGroupLabel>
                {renderTree(roots, 0)}
              </>
            )}
          </>
        )}
      </div>
    </nav>
  )
}

function NavGroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-2 pb-0.5 pt-2 text-3xs font-medium uppercase tracking-wide text-muted-foreground">
      {children}
    </p>
  )
}

interface NavRowProps {
  depth: number
  active: boolean
  label: string
  path?: string
  count?: number
  icon: React.ReactNode
  expanded?: boolean
  onToggle?: () => void
  onSelect: () => void
}

function NavRow({
  depth,
  active,
  label,
  path,
  count,
  icon,
  expanded,
  onToggle,
  onSelect,
}: NavRowProps) {
  return (
    <div
      className={cn(
        'relative flex h-7 items-center rounded-md pr-1.5 transition-colors',
        active ? 'bg-muted/60' : 'hover:bg-muted/40',
      )}
      style={{ paddingLeft: 6 + depth * 10 }}
    >
      {/* 当前范围高亮 = 左侧 2px 竖条（与主页夹树同一语言）。 */}
      {active && (
        <span
          aria-hidden
          className="absolute inset-y-1 left-0 w-0.5 rounded-full bg-foreground"
        />
      )}
      {onToggle ? (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-label={label}
          className="flex size-4 shrink-0 items-center justify-center text-muted-foreground"
        >
          <ChevronRight
            className={cn(
              'size-3 transition-transform',
              expanded && 'rotate-90',
            )}
          />
        </button>
      ) : (
        <span className="size-4 shrink-0" />
      )}
      <button
        type="button"
        onClick={onSelect}
        className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
      >
        <span
          className={cn('text-muted-foreground', active && 'text-foreground')}
        >
          {icon}
        </span>
        <span
          className={cn(
            'min-w-0 flex-1 truncate text-2xs',
            active ? 'font-medium text-foreground' : 'text-foreground/80',
          )}
        >
          {label}
        </span>
        {path && (
          <span className="max-w-16 shrink-0 truncate text-3xs text-muted-foreground">
            {path}
          </span>
        )}
        {typeof count === 'number' && (
          <span className="text-soft-count shrink-0 text-3xs">{count}</span>
        )}
      </button>
    </div>
  )
}
