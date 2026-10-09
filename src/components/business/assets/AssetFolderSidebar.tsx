'use client'

import { useMemo, useRef, useState, type MutableRefObject } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { useTranslations } from 'next-intl'

import {
  ChevronRight,
  Folder,
  FolderX,
  LayoutGrid,
  MoreHorizontal,
  PanelLeft,
  Plus,
  Search,
  X,
} from '@/components/icons'
import { ASSET_DND_MIME } from '@/constants/asset-dnd'
import { DURATION, EASE_STANDARD, LIQUID_SPRING } from '@/constants/motion'
import { PROJECT } from '@/constants/config'
import {
  filterFolders,
  folderIndentPx,
  getChildFolders,
  getFolderAncestorIds,
  getFolderPath,
  getPinnedFolders,
  getRootFolders,
} from '@/lib/folder-tree'
import { cn } from '@/lib/utils'
import type { ProjectRecord, ReorderProjectsRequest } from '@/types'
import { NumberTicker } from '@/components/ui/number-ticker'
import { useSpringSortableTransition } from '@/hooks/use-spring-sortable-transition'
import {
  AssetFolderMenu,
  type AssetFolderMenuActions,
} from '@/components/business/assets/AssetFolderMenu'

export type AssetFolderScope =
  | { kind: 'all' }
  | { kind: 'unassigned' }
  | { kind: 'folder'; id: string }

/** 栏里正在打字的那一行：新建（在哪一层）或改名（哪个夹）。 */
export type AssetFolderEdit =
  | { kind: 'create'; parentId: string | null }
  | { kind: 'rename'; id: string }

interface AssetFolderSidebarProps {
  folders: ProjectRecord[]
  isLoading?: boolean
  counts: {
    all?: number
    unassigned?: number
    byProject: Record<string, number>
  }
  scope: AssetFolderScope
  onScopeChange: (scope: AssetFolderScope) => void
  edit: AssetFolderEdit | null
  onEditChange: (edit: AssetFolderEdit | null) => void
  onCreate: (
    name: string,
    parentId: string | null,
  ) => Promise<ProjectRecord | null>
  onRename: (id: string, name: string) => void
  onTogglePin: (folder: ProjectRecord) => void
  onMove: (id: string, parentId: string | null) => void
  onRequestDelete: (folder: ProjectRecord) => void
  onReorder: (input: ReorderProjectsRequest) => void
  /** 大河里正被拖着的素材张数；> 0 时每个夹都是落点（「+ 加入 N 张」）。 */
  draggingCount: number
  onDropAssets: (folderId: string, assetIds: string[]) => void
  /** 桌面栏的「收起」。抽屉里不给。 */
  onCollapse?: () => void
  /** 触屏抽屉：⋯ 常显、行高 44、不拖动排序。 */
  touch?: boolean
  className?: string
}

/**
 * 栏里一切「长出来 / 收回去」（子夹、置顶组、新建那一行、行的进出）同一种手感：
 * 高度走液态弹簧（与栏的收起 / 展开同一根），透明度 120 线性。减少动态效果时只淡入淡出。
 */
type CollapseMotion = {
  initial: { height?: number; opacity: number }
  animate: {
    height?: 'auto'
    opacity: number
    transition: Record<string, unknown>
  }
  exit: {
    height?: number
    opacity: number
    transition: Record<string, unknown>
  }
}

function collapseMotion(reducedMotion: boolean | null): CollapseMotion {
  const fade = { duration: DURATION.fast, ease: EASE_STANDARD }
  if (reducedMotion) {
    return {
      initial: { opacity: 0 },
      animate: { opacity: 1, transition: { opacity: fade } },
      exit: { opacity: 0, transition: { opacity: fade } },
    }
  }
  return {
    initial: { height: 0, opacity: 0 },
    animate: {
      height: 'auto',
      opacity: 1,
      transition: { height: LIQUID_SPRING.unfold, opacity: fade },
    },
    exit: {
      height: 0,
      opacity: 0,
      transition: { height: LIQUID_SPRING.retract, opacity: fade },
    },
  }
}

/**
 * 素材页左边那一列文件夹（画板 `AfB` 系列，owner 09-28 选 B）。
 *
 * 全部素材 / 未归档 → 置顶 → 整棵树（层数不限，每层 ▸ 展开）。点一行 = 大河只剩
 * 这个夹（连所有层子孙夹）；
 * 把选中的图拖到一行上 = 也放进那个夹（⛔ 不是挪）；按住一行拖 = 同一层里排顺序；
 * 行尾 ⋯ = 改名 / 置顶 / 新建子文件夹 / 移到… / 删除；新建和改名就在行里打字。
 */
export function AssetFolderSidebar({
  folders,
  isLoading = false,
  counts,
  scope,
  onScopeChange,
  edit,
  onEditChange,
  onCreate,
  onRename,
  onTogglePin,
  onMove,
  onRequestDelete,
  onReorder,
  draggingCount,
  onDropAssets,
  onCollapse,
  touch = false,
  className,
}: AssetFolderSidebarProps) {
  const t = useTranslations('AssetsPage')
  const reducedMotion = useReducedMotion()
  const [query, setQuery] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set())
  const [dropTargetId, setDropTargetId] = useState<string | null>(null)
  /** 刚拖完排序的那一下 pointerup 会顺带点到行上 —— 这一下不算「打开这个夹」。 */
  const dragGuardRef = useRef(false)

  const roots = useMemo(() => getRootFolders(folders), [folders])
  const pinned = useMemo(() => getPinnedFolders(folders), [folders])
  const matches = useMemo(
    () => (query.trim() ? filterFolders(folders, query) : []),
    [folders, query],
  )

  const activeId = scope.kind === 'folder' ? scope.id : null
  const creatingUnder = edit?.kind === 'create' ? edit.parentId : undefined
  // 选中的夹、正在它下面新建的夹：一路往上的祖先都得展开，否则那一行藏在收起的父夹里。
  const forcedOpenIds = useMemo(
    () =>
      new Set([
        ...(activeId ? getFolderAncestorIds(folders, activeId) : []),
        ...(creatingUnder
          ? [creatingUnder, ...getFolderAncestorIds(folders, creatingUnder)]
          : []),
      ]),
    [folders, activeId, creatingUnder],
  )
  const isExpanded = (id: string) =>
    expandedIds.has(id) || forcedOpenIds.has(id)

  const heightMotion = collapseMotion(reducedMotion)

  const toggleExpanded = (id: string) =>
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const selectFolder = (id: string) => {
    if (dragGuardRef.current) return
    onScopeChange({ kind: 'folder', id })
  }

  const menuFor = (folder: ProjectRecord): AssetFolderMenuActions => ({
    onRename: () => onEditChange({ kind: 'rename', id: folder.id }),
    onTogglePin: () => onTogglePin(folder),
    onCreateChild: () => {
      setIsSearching(false)
      setQuery('')
      onEditChange({ kind: 'create', parentId: folder.id })
    },
    onMove: (parentId) => onMove(folder.id, parentId),
    onDelete: () => onRequestDelete(folder),
  })

  const commitCreate = async (name: string | null, parentId: string | null) => {
    if (!name) {
      onEditChange(null)
      return
    }
    const created = await onCreate(name, parentId)
    // 建好的子夹要看得见：父夹留在展开态（新建时只是临时展开）。
    if (created && parentId) {
      setExpandedIds((prev) => new Set(prev).add(parentId))
    }
    onEditChange(null)
  }

  const commitRename = (folder: ProjectRecord, name: string | null) => {
    if (name && name !== folder.name) onRename(folder.id, name)
    onEditChange(null)
  }

  const renderRow = (
    folder: ProjectRecord,
    options: { depth: number; group: 'tree' | 'pins' | 'search' },
  ): React.ReactNode => {
    const children =
      options.group === 'tree' ? getChildFolders(folders, folder.id) : []
    // 还没有子夹时，「新建子文件夹」那一行也得把它撑开，否则输入行根本不出现。
    const expanded =
      (children.length > 0 || creatingUnder === folder.id) &&
      isExpanded(folder.id)
    const editing = edit?.kind === 'rename' && edit.id === folder.id
    const path =
      options.group === 'search' && folder.parentId
        ? getFolderPath(folders, folder.id)
            .slice(0, -1)
            .map((entry) => entry.name)
            .join(' / ')
        : undefined

    return (
      <FolderRow
        key={folder.id}
        folder={folder}
        folders={folders}
        depth={options.depth}
        path={path}
        active={activeId === folder.id}
        count={counts.byProject[folder.id]}
        expandable={children.length > 0}
        expanded={expanded}
        onToggle={() => toggleExpanded(folder.id)}
        onSelect={() => selectFolder(folder.id)}
        editing={editing}
        onRenameCommit={(name) => commitRename(folder, name)}
        menu={menuFor(folder)}
        touch={touch}
        sortable={!touch && options.group !== 'search' && !edit}
        rowMotion={heightMotion}
        dropCount={draggingCount}
        isDropTarget={dropTargetId === `${options.group}:${folder.id}`}
        onDropTargetChange={(over) =>
          setDropTargetId((current) =>
            over
              ? `${options.group}:${folder.id}`
              : current === `${options.group}:${folder.id}`
                ? null
                : current,
          )
        }
        onDropAssets={(ids) => onDropAssets(folder.id, ids)}
      >
        {options.group === 'tree' ? (
          <AnimatePresence initial={false}>
            {expanded ? (
              <motion.div
                key="children"
                {...heightMotion}
                className="overflow-hidden"
              >
                {creatingUnder === folder.id ? (
                  <NewFolderRow
                    depth={options.depth + 1}
                    rowMotion={heightMotion}
                    touch={touch}
                    onCommit={(name) => commitCreate(name, folder.id)}
                  />
                ) : null}
                <SortableGroup
                  ids={children.map((child) => child.id)}
                  dragGuardRef={dragGuardRef}
                  onReorder={(ids) =>
                    onReorder({ kind: 'tree', parentId: folder.id, ids })
                  }
                >
                  <AnimatePresence initial={false}>
                    {children.map((child) =>
                      renderRow(child, {
                        depth: options.depth + 1,
                        group: 'tree',
                      }),
                    )}
                  </AnimatePresence>
                </SortableGroup>
              </motion.div>
            ) : null}
          </AnimatePresence>
        ) : null}
      </FolderRow>
    )
  }

  const iconButton =
    'grid shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors duration-fast hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none'
  const iconSize = touch ? 'size-11' : 'size-8'

  return (
    <aside
      aria-label={t('sidebarFolders')}
      className={cn('flex min-h-0 flex-col', className)}
    >
      <div className="flex shrink-0 items-center gap-0.5 pb-2 pl-2">
        <span className="text-2sm font-semibold text-foreground">
          {t('sidebarFolders')}
        </span>
        <span className="flex-1" />
        <button
          type="button"
          aria-label={t('folderSearch')}
          aria-pressed={isSearching}
          onClick={() => {
            setIsSearching((open) => !open)
            setQuery('')
          }}
          className={cn(iconButton, iconSize, isSearching && 'bg-muted')}
        >
          <Search className="size-4" />
        </button>
        <button
          type="button"
          aria-label={t('folderCreate')}
          aria-pressed={edit?.kind === 'create' && edit.parentId === null}
          disabled={folders.length >= PROJECT.MAX_PROJECTS_PER_USER}
          onClick={() => {
            setIsSearching(false)
            setQuery('')
            onEditChange({ kind: 'create', parentId: null })
          }}
          className={cn(
            iconButton,
            iconSize,
            'disabled:pointer-events-none disabled:opacity-50',
            edit?.kind === 'create' &&
              edit.parentId === null &&
              'bg-muted text-foreground',
          )}
        >
          <Plus className="size-4" />
        </button>
        {onCollapse ? (
          <button
            type="button"
            aria-label={t('folderRailCollapse')}
            onClick={onCollapse}
            className={cn(iconButton, iconSize)}
          >
            <PanelLeft className="size-4" />
          </button>
        ) : null}
      </div>

      {isSearching ? (
        <label className="mb-1 flex h-9 shrink-0 items-center gap-2 rounded-lg bg-muted px-2.5 text-muted-foreground">
          <Search className="size-3.5 shrink-0" />
          <input
            type="search"
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Escape') return
              event.preventDefault()
              event.stopPropagation()
              setIsSearching(false)
              setQuery('')
            }}
            placeholder={t('folderSearchPlaceholder')}
            aria-label={t('folderSearch')}
            className={cn(
              'min-w-0 flex-1 bg-transparent text-foreground outline-none placeholder:text-muted-foreground/80',
              touch ? 'text-base' : 'text-2sm',
            )}
          />
          {query ? (
            <button
              type="button"
              aria-label={t('folderSearchClear')}
              onClick={() => setQuery('')}
              className="grid size-5 place-items-center rounded text-muted-foreground hover:text-foreground"
            >
              <X className="size-3" />
            </button>
          ) : null}
        </label>
      ) : null}

      <div className="studio-scrollbar -mx-1 min-h-0 flex-1 overflow-y-auto px-1">
        {query.trim() ? (
          matches.length === 0 ? (
            <p className="px-2 py-4 text-center text-2sm text-muted-foreground">
              {t('folderSearchEmpty')}
            </p>
          ) : (
            matches.map((folder) =>
              renderRow(folder, { depth: 0, group: 'search' }),
            )
          )
        ) : (
          <>
            <SmartRow
              icon={<LayoutGrid className="size-3.5" />}
              label={t('sectionAllAssets')}
              count={counts.all}
              active={scope.kind === 'all'}
              touch={touch}
              onSelect={() => onScopeChange({ kind: 'all' })}
            />
            <SmartRow
              icon={<FolderX className="size-3.5" />}
              label={t('sidebarUnassigned')}
              count={counts.unassigned}
              active={scope.kind === 'unassigned'}
              touch={touch}
              onSelect={() => onScopeChange({ kind: 'unassigned' })}
            />

            <AnimatePresence initial={false}>
              {pinned.length > 0 ? (
                <motion.div
                  key="pinned"
                  {...heightMotion}
                  className="overflow-hidden"
                >
                  <GroupLabel>{t('folderPinnedGroup')}</GroupLabel>
                  <SortableGroup
                    ids={pinned.map((folder) => folder.id)}
                    dragGuardRef={dragGuardRef}
                    onReorder={(ids) => onReorder({ kind: 'pins', ids })}
                  >
                    <AnimatePresence initial={false}>
                      {pinned.map((folder) =>
                        renderRow(folder, { depth: 0, group: 'pins' }),
                      )}
                    </AnimatePresence>
                  </SortableGroup>
                </motion.div>
              ) : null}
            </AnimatePresence>

            <GroupLabel>
              {t('folderAllGroup', { count: folders.length })}
            </GroupLabel>
            {isLoading && folders.length === 0 ? (
              <div aria-hidden className="space-y-1">
                {[0, 1, 2, 3].map((index) => (
                  <div key={index} className="h-8.5 rounded-lg bg-muted/60" />
                ))}
              </div>
            ) : null}
            <AnimatePresence initial={false}>
              {creatingUnder === null ? (
                <NewFolderRow
                  key="new-root"
                  depth={0}
                  rowMotion={heightMotion}
                  touch={touch}
                  onCommit={(name) => commitCreate(name, null)}
                />
              ) : null}
            </AnimatePresence>
            <SortableGroup
              ids={roots.map((folder) => folder.id)}
              dragGuardRef={dragGuardRef}
              onReorder={(ids) =>
                onReorder({ kind: 'tree', parentId: null, ids })
              }
            >
              <AnimatePresence initial={false}>
                {roots.map((folder) =>
                  renderRow(folder, { depth: 0, group: 'tree' }),
                )}
              </AnimatePresence>
            </SortableGroup>
          </>
        )}
      </div>
    </aside>
  )
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-2 pb-1 pt-3 text-2xs font-semibold text-muted-foreground/80">
      {children}
    </p>
  )
}

/**
 * 一层可拖动排序的行（同一层 / 置顶组各一个）。拖出 4px 才算拖 —— 点一下仍是打开。
 * ⚠ 只能在这一组里排：换层走菜单里的「移到…」。
 */
function SortableGroup({
  ids,
  dragGuardRef,
  onReorder,
  children,
}: {
  ids: string[]
  dragGuardRef: MutableRefObject<boolean>
  onReorder: (ids: string[]) => void
  children: React.ReactNode
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  )

  const handleDragEnd = (event: DragEndEvent) => {
    // pointerup 之后浏览器还会补一个 click —— 等它过去再放行。
    window.setTimeout(() => {
      dragGuardRef.current = false
    }, 0)
    const { active, over } = event
    if (!over || active.id === over.id) return
    const from = ids.indexOf(String(active.id))
    const to = ids.indexOf(String(over.id))
    if (from < 0 || to < 0) return
    onReorder(arrayMove(ids, from, to))
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={() => {
        dragGuardRef.current = true
      }}
      onDragEnd={handleDragEnd}
      onDragCancel={() => {
        dragGuardRef.current = false
      }}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
    </DndContext>
  )
}

function SmartRow({
  icon,
  label,
  count,
  active,
  touch,
  onSelect,
}: {
  icon: React.ReactNode
  label: string
  count?: number
  active: boolean
  touch: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      aria-current={active ? 'true' : undefined}
      onClick={onSelect}
      className={cn(
        'flex w-full items-center gap-2 rounded-lg pl-1 pr-2 text-left text-2sm transition-colors duration-fast',
        touch ? 'h-11' : 'h-8.5',
        active
          ? 'bg-muted font-semibold text-foreground'
          : 'text-foreground hover:bg-muted/60',
      )}
    >
      <span className="w-3.5 shrink-0" />
      <span className="grid size-5 shrink-0 place-items-center text-muted-foreground">
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {typeof count === 'number' ? (
        <NumberTicker
          value={count}
          startValue={count}
          className="font-mono text-2xs font-normal tracking-normal text-muted-foreground"
        />
      ) : null}
    </button>
  )
}

function FolderCover({ url }: { url: string | null }) {
  if (!url) {
    return (
      <span className="grid size-5 shrink-0 place-items-center rounded-sm bg-muted text-muted-foreground">
        <Folder className="size-3" />
      </span>
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- R2 缩略图，已是小图
    <img
      src={url}
      alt=""
      loading="lazy"
      className="size-5 shrink-0 rounded-sm object-cover ring-1 ring-border"
    />
  )
}

interface FolderRowProps {
  folder: ProjectRecord
  folders: ProjectRecord[]
  /** 最外层 = 0；层数不限，缩进见 `folderIndentPx`。 */
  depth: number
  /** 搜索结果里给子夹写上整条父路径。 */
  path?: string
  active: boolean
  count?: number
  expandable: boolean
  expanded: boolean
  onToggle: () => void
  onSelect: () => void
  editing: boolean
  onRenameCommit: (name: string | null) => void
  menu: AssetFolderMenuActions
  touch: boolean
  sortable: boolean
  rowMotion: CollapseMotion
  dropCount: number
  isDropTarget: boolean
  onDropTargetChange: (over: boolean) => void
  onDropAssets: (ids: string[]) => void
  children?: React.ReactNode
}

function FolderRow({
  folder,
  folders,
  depth,
  path,
  active,
  count,
  expandable,
  expanded,
  onToggle,
  onSelect,
  editing,
  onRenameCommit,
  menu,
  touch,
  sortable,
  rowMotion,
  dropCount,
  isDropTarget,
  onDropTargetChange,
  onDropAssets,
  children,
}: FolderRowProps) {
  const t = useTranslations('AssetsPage')
  const [menuOpen, setMenuOpen] = useState(false)
  const sortableTransition = useSpringSortableTransition()
  const {
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: folder.id,
    disabled: !sortable || editing,
    transition: sortableTransition,
  })

  const hasAssets = (event: React.DragEvent) =>
    Array.from(event.dataTransfer.types).includes(ASSET_DND_MIME)

  return (
    <motion.div {...rowMotion}>
      <div
        ref={setNodeRef}
        style={{
          // 只在竖直方向走：同一层里排顺序，不往旁边拖。
          transform: transform
            ? `translate3d(0, ${transform.y}px, 0)`
            : undefined,
          transition,
        }}
        className={cn('relative', isDragging && 'z-10')}
      >
        <div
          ref={setActivatorNodeRef}
          {...listeners}
          role="treeitem"
          aria-level={depth + 1}
          aria-selected={active}
          aria-expanded={expandable ? expanded : undefined}
          // 层深是算出来的数，只能走行内样式（见 FOLDER_TREE_INDENT）。
          style={{ paddingLeft: folderIndentPx('sidebar', depth) }}
          onDragOver={(event) => {
            if (!hasAssets(event)) return
            event.preventDefault()
            event.dataTransfer.dropEffect = 'copy'
            if (!isDropTarget) onDropTargetChange(true)
          }}
          onDragLeave={(event) => {
            if (event.currentTarget.contains(event.relatedTarget as Node)) {
              return
            }
            onDropTargetChange(false)
          }}
          onDrop={(event) => {
            const raw = event.dataTransfer.getData(ASSET_DND_MIME)
            if (!raw) return
            event.preventDefault()
            onDropTargetChange(false)
            try {
              const ids: unknown = JSON.parse(raw)
              if (Array.isArray(ids)) {
                onDropAssets(
                  ids.filter((id): id is string => typeof id === 'string'),
                )
              }
            } catch {
              // 不是我们自己的载荷 —— 当没拖过。
            }
          }}
          className={cn(
            'group/row relative flex items-center gap-2 rounded-lg pr-1 text-2sm transition-[background-color,box-shadow,scale] duration-fast',
            touch ? 'h-11' : 'h-8.5',
            editing
              ? 'bg-background ring-2 ring-inset ring-foreground'
              : isDropTarget
                ? 'bg-muted ring-2 ring-inset ring-foreground'
                : active
                  ? 'bg-muted'
                  : 'hover:bg-muted/60',
            menuOpen && !active && 'bg-muted/60',
            isDragging && 'scale-[1.02] bg-background shadow-lg',
          )}
        >
          {expandable ? (
            <button
              type="button"
              aria-label={expanded ? t('folderCollapse') : t('folderExpand')}
              onClick={onToggle}
              className="grid h-full w-3.5 shrink-0 place-items-center text-muted-foreground"
            >
              <ChevronRight
                className={cn(
                  'size-3 transition-transform duration-base ease-standard motion-reduce:transition-none',
                  expanded && 'rotate-90',
                )}
              />
            </button>
          ) : (
            <span className="w-3.5 shrink-0" />
          )}

          {editing ? (
            <span className="flex min-w-0 flex-1 items-center gap-2">
              <FolderCover url={folder.coverUrl} />
              <FolderNameInput
                initial={folder.name}
                touch={touch}
                onCommit={onRenameCommit}
              />
            </span>
          ) : (
            <button
              type="button"
              onClick={onSelect}
              className={cn(
                'flex h-full min-w-0 flex-1 items-center gap-2 text-left text-foreground',
                active ? 'font-semibold' : 'font-medium',
              )}
            >
              <FolderCover url={folder.coverUrl} />
              <span className="min-w-0 flex-1 truncate">{folder.name}</span>
              {path ? (
                <span className="max-w-20 shrink-0 truncate text-2xs font-normal text-muted-foreground">
                  {path}
                </span>
              ) : null}
            </button>
          )}

          {editing ? null : isDropTarget ? (
            <span className="shrink-0 rounded-md bg-foreground px-2 text-2xs leading-5 font-semibold text-background">
              {t('folderDropAdd', { count: dropCount })}
            </span>
          ) : (
            <span
              className={cn(
                'relative flex h-6 shrink-0 items-center justify-end',
                touch ? 'gap-1' : 'min-w-6',
              )}
            >
              {typeof count === 'number' ? (
                <NumberTicker
                  value={count}
                  startValue={count}
                  className={cn(
                    'font-mono text-2xs font-normal tracking-normal text-muted-foreground transition-opacity duration-fast',
                    !touch && 'group-hover/row:opacity-0',
                    !touch && menuOpen && 'opacity-0',
                  )}
                />
              ) : null}
              <AssetFolderMenu
                folder={folder}
                folders={folders}
                onOpenChange={setMenuOpen}
                {...menu}
                trigger={
                  <button
                    type="button"
                    aria-label={t('folderMenu')}
                    onPointerDown={(event) => event.stopPropagation()}
                    className={cn(
                      'grid shrink-0 place-items-center rounded-md text-foreground transition-opacity duration-fast focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                      touch
                        ? 'size-9'
                        : 'absolute right-0 size-6 opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100',
                      menuOpen &&
                        'bg-background opacity-100 ring-1 ring-border',
                    )}
                  >
                    <MoreHorizontal className="size-4" />
                  </button>
                }
              />
            </span>
          )}
        </div>
        {children}
      </div>
    </motion.div>
  )
}

/** 新建：这一层最前面长出一行，直接打字；回车建好，Esc 或空着失焦 = 不建。 */
function NewFolderRow({
  depth,
  rowMotion,
  touch,
  onCommit,
}: {
  depth: number
  rowMotion: CollapseMotion
  touch: boolean
  onCommit: (name: string | null) => Promise<void>
}) {
  const t = useTranslations('AssetsPage')
  const [pendingName, setPendingName] = useState<string | null>(null)

  return (
    <motion.div {...rowMotion} className="overflow-hidden">
      <div
        className={cn(
          'flex items-center gap-2 rounded-lg bg-background pr-2 ring-2 ring-inset ring-foreground',
          touch ? 'h-11' : 'h-8.5',
        )}
        style={{ paddingLeft: folderIndentPx('sidebar', depth) }}
      >
        <span className="w-3.5 shrink-0" />
        <FolderCover url={null} />
        {pendingName === null ? (
          <FolderNameInput
            initial={t('folderNewName')}
            touch={touch}
            onCommit={(name) => {
              if (name) setPendingName(name)
              void onCommit(name)
            }}
          />
        ) : (
          <span className="min-w-0 flex-1 truncate text-2sm font-medium text-foreground">
            {pendingName}
          </span>
        )}
      </div>
    </motion.div>
  )
}

function FolderNameInput({
  initial,
  touch,
  onCommit,
}: {
  initial: string
  touch: boolean
  onCommit: (name: string | null) => void
}) {
  const t = useTranslations('AssetsPage')
  const doneRef = useRef(false)
  const finish = (value: string) => {
    if (doneRef.current) return
    doneRef.current = true
    const name = value.trim()
    onCommit(name ? name : null)
  }

  return (
    <input
      autoFocus
      defaultValue={initial}
      maxLength={PROJECT.NAME_MAX_LENGTH}
      aria-label={t('folderRenameInput')}
      onFocus={(event) => event.currentTarget.select()}
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault()
          finish(event.currentTarget.value)
        } else if (event.key === 'Escape') {
          event.preventDefault()
          event.stopPropagation()
          finish('')
        }
      }}
      onBlur={(event) => finish(event.currentTarget.value)}
      className={cn(
        'h-6 min-w-0 flex-1 bg-transparent font-medium text-foreground outline-none',
        touch ? 'text-base' : 'text-2sm',
      )}
    />
  )
}
