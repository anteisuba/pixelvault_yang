'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'

import {
  Check,
  ChevronRight,
  Folder,
  FolderPlus,
  FolderX,
  Heart,
  LayoutGrid,
  MoreHorizontal,
  Pin,
  Search,
  X,
} from '@/components/icons'
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
} from '@/components/ui/drawer'
import {
  filterFolders,
  getChildFolders,
  getFolderAncestorIds,
  getPinnedFolders,
  getRootFolders,
} from '@/lib/folder-tree'
import { cn } from '@/lib/utils'
import type { ProjectRecord } from '@/types'
import { AssetFolderMenu } from '@/features/assets/components/AssetFolderMenu'
import type { AssetFolderScope } from '@/features/assets/components/AssetFolderSidebar'

interface AssetLocationsSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  folders: ProjectRecord[]
  counts: {
    all?: number
    unassigned?: number
    byProject: Record<string, number>
  }
  favoritesCount?: number
  scope: AssetFolderScope
  favoritesActive: boolean
  renamingId: string | null
  onRenamingChange: (id: string | null) => void
  onSelectScope: (scope: AssetFolderScope, opts?: { liked?: boolean }) => void
  onCreate: (
    name: string,
    parentId: string | null,
  ) => Promise<ProjectRecord | null>
  onRename: (id: string, name: string) => void
  onTogglePin: (folder: ProjectRecord) => void
  onMove: (id: string, parentId: string | null) => void
  onRequestDelete: (folder: ProjectRecord) => void
}

interface InlineFolderRenameProps {
  initialValue: string
  onCommit: (value: string) => void
  onCancel: () => void
}

function InlineFolderRename({
  initialValue,
  onCommit,
  onCancel,
}: InlineFolderRenameProps) {
  const [draft, setDraft] = useState(initialValue)
  const inputRef = useRef<HTMLInputElement>(null)
  const committedRef = useRef(false)

  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.focus()
    el.select()
  }, [])

  const finish = () => {
    if (committedRef.current) return
    committedRef.current = true
    const trimmed = draft.trim()
    if (trimmed && trimmed !== initialValue) onCommit(trimmed)
    else onCancel()
  }

  return (
    <input
      ref={inputRef}
      type="text"
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={finish}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault()
          finish()
        } else if (event.key === 'Escape') {
          event.preventDefault()
          committedRef.current = true
          onCancel()
        }
      }}
      className="h-8 min-w-0 flex-1 rounded-lg bg-muted px-2.5 text-sm font-medium text-foreground outline-none ring-1 ring-foreground/20"
    />
  )
}

/**
 * 手机素材位置与文件夹抽屉（Apple iOS Files S1 风格）：
 * 统一替代原先「破损下拉抽屉 + 左侧二次冲突文件夹栏」两层叠加结构。
 * 顶部导航栏提供「新建」与关闭；下方暖石面分两张纯白 Inset Grouped 圆角卡片：
 * 1. 智能视图（全部素材 · 收藏 · 未归档），统一 48px 行高与对齐计数；
 * 2. 文件夹树（支持展开/收起、行内新建改名、每行 ⋯ 锚定 UIMenu 管理）。
 */
export function AssetLocationsSheet({
  open,
  onOpenChange,
  folders,
  counts,
  favoritesCount,
  scope,
  favoritesActive,
  renamingId,
  onRenamingChange,
  onSelectScope,
  onCreate,
  onRename,
  onTogglePin,
  onMove,
  onRequestDelete,
}: AssetLocationsSheetProps) {
  const t = useTranslations('AssetsPage')
  const tCommon = useTranslations('Common')
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [creating, setCreating] = useState(false)
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => new Set())

  const roots = useMemo(() => getRootFolders(folders), [folders])
  const pinned = useMemo(() => getPinnedFolders(folders), [folders])
  const matches = useMemo(
    () => (query.trim() ? filterFolders(folders, query) : []),
    [folders, query],
  )

  const activeFolderId = scope.kind === 'folder' ? scope.id : null
  const activeAncestors = useMemo(
    () =>
      activeFolderId
        ? new Set(getFolderAncestorIds(folders, activeFolderId))
        : new Set<string>(),
    [folders, activeFolderId],
  )

  const selectAndClose = (
    nextScope: AssetFolderScope,
    opts?: { liked?: boolean },
  ) => {
    onSelectScope(nextScope, opts)
    onOpenChange(false)
  }

  const handleCreateFolder = async (parentId: string | null) => {
    if (creating) return
    setCreating(true)
    try {
      if (parentId) {
        setCollapsedIds((prev) => {
          if (!prev.has(parentId)) return prev
          const next = new Set(prev)
          next.delete(parentId)
          return next
        })
      }
      const created = await onCreate(t('folderUntitled'), parentId)
      if (created) onRenamingChange(created.id)
    } finally {
      setCreating(false)
    }
  }

  const toggleExpand = (id: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // 把树拍平成当前可见行（保留缩进深度和是否有子节点），方便渲染统一分割线与高度。
  const visibleTreeRows = useMemo(() => {
    const rows: {
      folder: ProjectRecord
      depth: number
      hasChildren: boolean
      expanded: boolean
    }[] = []
    const visit = (list: readonly ProjectRecord[], depth: number) => {
      for (const folder of list) {
        const children = getChildFolders(folders, folder.id)
        const hasChildren = children.length > 0
        const expanded =
          hasChildren &&
          (!collapsedIds.has(folder.id) || activeAncestors.has(folder.id))
        rows.push({ folder, depth, hasChildren, expanded })
        if (expanded) visit(children, depth + 1)
      }
    }
    visit(roots, 0)
    return rows
  }, [folders, roots, collapsedIds, activeAncestors])

  const smartItems: {
    key: string
    label: string
    count: number | undefined
    active: boolean
    icon: typeof LayoutGrid
    onClick: () => void
  }[] = [
    {
      key: 'all',
      label: t('sectionAllAssets'),
      count: counts.all,
      active: scope.kind === 'all' && !favoritesActive,
      icon: LayoutGrid,
      onClick: () => selectAndClose({ kind: 'all' }, { liked: false }),
    },
    {
      key: 'favorites',
      label: t('sidebarFavorites'),
      count: favoritesCount,
      active: favoritesActive,
      icon: Heart,
      onClick: () => selectAndClose({ kind: 'all' }, { liked: true }),
    },
    {
      key: 'unassigned',
      label: t('sidebarUnassigned'),
      count: counts.unassigned,
      active: scope.kind === 'unassigned',
      icon: FolderX,
      onClick: () => selectAndClose({ kind: 'unassigned' }, { liked: false }),
    },
  ]

  const renderFolderRow = (
    folder: ProjectRecord,
    opts: {
      depth: number
      hasChildren?: boolean
      expanded?: boolean
      showPinBadge?: boolean
      divider?: boolean
    },
  ) => {
    const selected = scope.kind === 'folder' && scope.id === folder.id
    const count = counts.byProject[folder.id]
    const isRenaming = renamingId === folder.id

    return (
      <div key={folder.id} className="relative">
        {opts.divider ? (
          <div
            aria-hidden
            className="h-px bg-border/60"
            style={{ marginLeft: 48 + opts.depth * 18 }}
          />
        ) : null}
        <div
          className={cn(
            'flex min-h-12 items-center gap-1 pr-2 transition-colors duration-fast ease-standard',
            selected ? 'bg-muted/60' : 'active:bg-muted/50',
          )}
          style={{ paddingLeft: 12 + opts.depth * 18 }}
        >
          {opts.hasChildren ? (
            <button
              type="button"
              aria-label={
                opts.expanded ? t('folderCollapse') : t('folderExpand')
              }
              onClick={() => toggleExpand(folder.id)}
              className="touch-target grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground active:bg-muted"
            >
              <ChevronRight
                className={cn(
                  'size-3.5 transition-transform duration-fast ease-standard',
                  opts.expanded && 'rotate-90',
                )}
                aria-hidden
              />
            </button>
          ) : (
            <span aria-hidden className="w-6 shrink-0" />
          )}

          {isRenaming ? (
            <div className="flex min-w-0 flex-1 items-center gap-2.5 py-1.5">
              <Folder
                className="size-4.5 shrink-0 text-muted-foreground"
                aria-hidden
              />
              <InlineFolderRename
                initialValue={folder.name}
                onCommit={(nextName) => {
                  onRename(folder.id, nextName)
                  onRenamingChange(null)
                }}
                onCancel={() => onRenamingChange(null)}
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={() =>
                selectAndClose(
                  { kind: 'folder', id: folder.id },
                  { liked: false },
                )
              }
              className="touch-target-y flex min-h-12 min-w-0 flex-1 items-center gap-2.5 py-2 pr-1 text-left"
            >
              <Folder
                className={cn(
                  'size-4.5 shrink-0',
                  selected ? 'text-foreground' : 'text-muted-foreground',
                )}
                aria-hidden
              />
              <span
                className={cn(
                  'min-w-0 flex-1 truncate text-sm',
                  selected
                    ? 'font-semibold text-foreground'
                    : 'font-medium text-foreground',
                )}
              >
                {folder.name}
              </span>
              {opts.showPinBadge ? (
                <Pin
                  className="size-3 shrink-0 text-muted-foreground/70"
                  aria-hidden
                />
              ) : null}
              {typeof count === 'number' && count > 0 ? (
                <span className="shrink-0 text-sm text-muted-foreground tabular-nums">
                  {count}
                </span>
              ) : null}
              <span className="grid w-4 shrink-0 place-items-center">
                {selected ? (
                  <Check className="size-4 text-foreground" aria-hidden />
                ) : null}
              </span>
            </button>
          )}

          {!isRenaming ? (
            <AssetFolderMenu
              folder={folder}
              folders={folders}
              align="end"
              onRename={() => onRenamingChange(folder.id)}
              onTogglePin={() => onTogglePin(folder)}
              onCreateChild={() => void handleCreateFolder(folder.id)}
              onMove={(parentId) => onMove(folder.id, parentId)}
              onDelete={() => onRequestDelete(folder)}
              trigger={
                <button
                  type="button"
                  aria-label={t('folderMenu')}
                  className="touch-target grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground active:bg-muted"
                >
                  <MoreHorizontal className="size-4" aria-hidden />
                </button>
              }
            />
          ) : null}
        </div>
      </div>
    )
  }

  return (
    <Drawer
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setQuery('')
          setSearching(false)
          onRenamingChange(null)
        }
        onOpenChange(next)
      }}
    >
      <DrawerContent
        data-testid="assets-locations-sheet"
        className="flex max-h-dvh flex-col bg-bubble dark:bg-background"
        style={{ maxHeight: '82dvh' }}
      >
        {/* Apple iOS Modal Sheet Header：等宽左右槽确保标题精确居中 */}
        <div className="flex shrink-0 items-center gap-2 px-4 pt-2 pb-3">
          <div className="flex flex-1 justify-start">
            <button
              type="button"
              disabled={creating}
              onClick={() => void handleCreateFolder(null)}
              className="touch-target-y inline-flex h-8 items-center gap-1.5 rounded-full bg-card px-3 text-xs font-medium text-foreground shadow-ring active:bg-muted disabled:opacity-50"
            >
              <FolderPlus
                className="size-3.5 text-muted-foreground"
                aria-hidden
              />
              <span>{t('folderNewName')}</span>
            </button>
          </div>

          <DrawerTitle className="shrink-0 text-center text-base font-semibold tracking-tight text-foreground">
            {t('scopeTabsLabel')}
          </DrawerTitle>
          <DrawerDescription className="sr-only">
            {t('folderDrawerDescription')}
          </DrawerDescription>

          <div className="flex flex-1 justify-end">
            <button
              type="button"
              aria-label={tCommon('close')}
              onClick={() => onOpenChange(false)}
              className="touch-target grid size-8 shrink-0 place-items-center rounded-full bg-fill-strong/75 text-muted-foreground active:bg-fill-strong"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
        </div>

        {/* Scrollable Apple S1 Inset Grouped Sections */}
        <div
          className="scrollbar-none min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-4"
          style={{
            paddingBottom: 'max(var(--keyboard-safe-area-bottom, 0px), 1.5rem)',
          }}
        >
          {/* Section 1：智能视图（全部素材 · 收藏 · 未归档） */}
          <section className="overflow-hidden rounded-2xl bg-card shadow-ring">
            {smartItems.map((item, idx) => {
              const Icon = item.icon
              return (
                <div key={item.key}>
                  {idx > 0 ? (
                    <div aria-hidden className="ml-13 h-px bg-border/60" />
                  ) : null}
                  <button
                    type="button"
                    onClick={item.onClick}
                    className={cn(
                      'touch-target-y flex min-h-12 w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors duration-fast ease-standard',
                      item.active ? 'bg-muted/60' : 'active:bg-muted/50',
                    )}
                  >
                    <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-muted/85 text-foreground">
                      <Icon className="size-4" aria-hidden />
                    </span>
                    <span
                      className={cn(
                        'min-w-0 flex-1 truncate text-sm text-foreground',
                        item.active ? 'font-semibold' : 'font-medium',
                      )}
                    >
                      {item.label}
                    </span>
                    {typeof item.count === 'number' ? (
                      <span className="shrink-0 text-sm text-muted-foreground tabular-nums">
                        {item.count}
                      </span>
                    ) : null}
                    <span className="grid w-4 shrink-0 place-items-center">
                      {item.active ? (
                        <Check className="size-4 text-foreground" aria-hidden />
                      ) : null}
                    </span>
                  </button>
                </div>
              )
            })}
          </section>

          {/* Section 2：置顶文件夹（有置顶项且未在搜夹时显示） */}
          {pinned.length > 0 && !query.trim() ? (
            <section>
              <div className="px-3 pb-1.5 text-xs font-medium text-muted-foreground">
                {t('folderPinnedGroup')}
              </div>
              <div className="overflow-hidden rounded-2xl bg-card shadow-ring">
                {pinned.map((folder, idx) =>
                  renderFolderRow(folder, {
                    depth: 0,
                    showPinBadge: true,
                    divider: idx > 0,
                  }),
                )}
              </div>
            </section>
          ) : null}

          {/* Section 3：文件夹树 */}
          <section>
            <div className="flex items-center justify-between px-3 pb-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                {t('sidebarFolders')}
              </span>
              {folders.length >= 6 ? (
                <button
                  type="button"
                  aria-label={t('folderSearchPlaceholder')}
                  onClick={() => {
                    setSearching((prev) => {
                      if (prev) setQuery('')
                      return !prev
                    })
                  }}
                  className="touch-target grid size-6 place-items-center rounded-full text-muted-foreground active:bg-muted"
                >
                  <Search className="size-3.5" aria-hidden />
                </button>
              ) : null}
            </div>

            {searching ? (
              <label className="mb-2 flex h-9 items-center gap-2 rounded-xl bg-card px-3 shadow-ring">
                <Search
                  className="size-3.5 shrink-0 text-muted-foreground"
                  aria-hidden
                />
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={t('folderSearchPlaceholder')}
                  className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
                />
                {query ? (
                  <button
                    type="button"
                    aria-label={tCommon('close')}
                    onClick={() => setQuery('')}
                    className="touch-target grid size-5 place-items-center rounded-full bg-muted text-muted-foreground"
                  >
                    <X className="size-3" aria-hidden />
                  </button>
                ) : null}
              </label>
            ) : null}

            <div className="overflow-hidden rounded-2xl bg-card shadow-ring">
              {query.trim() ? (
                matches.length > 0 ? (
                  matches.map((folder, idx) =>
                    renderFolderRow(folder, { depth: 0, divider: idx > 0 }),
                  )
                ) : (
                  <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                    {t('emptySearchTitle')}
                  </div>
                )
              ) : visibleTreeRows.length > 0 ? (
                visibleTreeRows.map((row, idx) =>
                  renderFolderRow(row.folder, {
                    depth: row.depth,
                    hasChildren: row.hasChildren,
                    expanded: row.expanded,
                    divider: idx > 0,
                  }),
                )
              ) : (
                <button
                  type="button"
                  disabled={creating}
                  onClick={() => void handleCreateFolder(null)}
                  className="touch-target-y flex min-h-12 w-full items-center gap-3 px-4 py-3 text-left text-sm font-medium text-muted-foreground active:bg-muted/50"
                >
                  <FolderPlus className="size-4.5" aria-hidden />
                  <span>{t('folderNewName')}</span>
                </button>
              )}
            </div>
          </section>
        </div>
      </DrawerContent>
    </Drawer>
  )
}
