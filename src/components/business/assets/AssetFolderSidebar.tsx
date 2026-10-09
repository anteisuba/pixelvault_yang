'use client'

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from 'react'
import { createPortal } from 'react-dom'
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useReducedMotion,
} from 'motion/react'
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DraggableSyntheticListeners,
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
import { FOLDER_TREE_DRAG } from '@/constants/asset-folder-tree'
import {
  DURATION,
  EASE_STANDARD,
  LIQUID_SPRING,
  SPRING,
} from '@/constants/motion'
import { PROJECT } from '@/constants/config'
import {
  filterFolders,
  folderIndentPx,
  getChildFolders,
  getFolderAncestorIds,
  getFolderPath,
  getPinnedFolders,
  getRootFolders,
  planFolderDrop,
  resolveFolderDropTarget,
  type FolderDropPlan,
  type FolderDropTarget,
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
  /** 栏里正在改名的那一行（新建出来的「未命名文件夹」也直接进这个状态）。 */
  renamingId: string | null
  onRenamingChange: (id: string | null) => void
  onCreate: (
    name: string,
    parentId: string | null,
  ) => Promise<ProjectRecord | null>
  onRename: (id: string, name: string) => void
  onTogglePin: (folder: ProjectRecord) => void
  onMove: (id: string, parentId: string | null) => void
  onRequestDelete: (folder: ProjectRecord) => void
  /** 置顶组拖着排序。 */
  onReorder: (input: ReorderProjectsRequest) => void
  /** 树里拖一个夹落下：挂到哪、那一层排成什么样（见 `planFolderDrop`）。 */
  onPlace: (plan: FolderDropPlan) => void
  /** 大河里正被拖着的素材张数；> 0 时每个夹都是落点（「+ 加入 N 张」）。 */
  draggingCount: number
  onDropAssets: (folderId: string, assetIds: string[]) => void
  /** 桌面栏的「收起」。抽屉里不给。 */
  onCollapse?: () => void
  /** 触屏抽屉：⋯ 常显、行高 44、不拖动（长按一行 = ⋯ 菜单）。 */
  touch?: boolean
  className?: string
}

/**
 * 栏里一切「长出来 / 收回去」（子夹、置顶组、新建出来的那一行、行的进出）同一种手感：
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

/** 插入线的起点：那一行的缩进 + ▸ 那一格（`w-3.5`）。 */
const DROP_LINE_LEAD_PX = 14
/** 拿起来的影子相对指针的位置（落在指针右下，不挡住指针压着的那一行）。 */
const GHOST_OFFSET = { x: 10, y: -16 } as const

/** 展开集合里补上这几个（都已在 = 原样返回，不触发重渲染）。 */
function withExpanded(prev: Set<string>, ids: readonly string[]): Set<string> {
  return ids.every((id) => prev.has(id)) ? prev : new Set([...prev, ...ids])
}

/** 正在拖的夹：落点 + 插入线（排到两行之间时才有）的位置。 */
type FolderDragState = {
  id: string
  target: FolderDropTarget | null
  line: { top: number; left: number } | null
}

/**
 * 素材页左边那一列文件夹（画板 `AfB` 系列，owner 09-28 选 B；交互 owner 2026-10-09
 * 选「像 Eagle」，原型 `8BdQmDyx2yNwpB592ZLYa2`）。
 *
 * 全部素材 / 未归档 → 置顶 → 整棵树（层数不限，每层 ▸ 展开）。点一行 = 大河只剩
 * 这个夹（连所有层子孙夹）；把选中的图拖到一行上 = 也放进那个夹（⛔ 不是挪）。
 *
 * - 新建不弹框、不另起输入行：栏顶「+」/ 菜单「新建子文件夹」当场建一个真的
 *   「未命名文件夹」，那一行长出来就在改名，名字全选，打字回车即可。
 * - 改名：⋯ / 右键「改名」、F2、双击名字。
 * - 拖一个夹（桌面）：压在一行中间 = 放进去（黑框）；压在上 / 下边 = 排到它前 / 后
 *   （黑线，缩进到那一行那一层）；停在收着的夹上会自己展开。⛔ 拖不进自己和自己的子孙。
 * - 触屏不拖：长按一行 = ⋯ 菜单（里面有「新建子文件夹」「移到…」）。
 */
export function AssetFolderSidebar({
  folders,
  isLoading = false,
  counts,
  scope,
  onScopeChange,
  renamingId,
  onRenamingChange,
  onCreate,
  onRename,
  onTogglePin,
  onMove,
  onRequestDelete,
  onReorder,
  onPlace,
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
  const [isCreating, setIsCreating] = useState(false)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set())
  const [dropTargetId, setDropTargetId] = useState<string | null>(null)
  /** 刚拖完的那一下 pointerup 会顺带点到行上 —— 这一下不算「打开这个夹」。 */
  const dragGuardRef = useRef(false)

  // ── 拖一个夹（树里，桌面指针）──
  const treeRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [pending, setPending] = useState<{
    id: string
    pointerId: number
    x0: number
    y0: number
  } | null>(null)
  const [drag, setDrag] = useState<FolderDragState | null>(null)
  const [landed, setLanded] = useState<{ id: string; tick: number } | null>(
    null,
  )
  const ghostX = useMotionValue(0)
  const ghostY = useMotionValue(0)
  /** 拖动那段手势跨好几次渲染：落下时要读到最新的树和回调，而不是按下那一刻的。 */
  const latestRef = useRef({ folders, onPlace })
  useEffect(() => {
    latestRef.current = { folders, onPlace }
  })

  const roots = useMemo(() => getRootFolders(folders), [folders])
  const pinned = useMemo(() => getPinnedFolders(folders), [folders])
  const matches = useMemo(
    () => (query.trim() ? filterFolders(folders, query) : []),
    [folders, query],
  )

  const activeId = scope.kind === 'folder' ? scope.id : null
  // 选中的夹、正在改名的夹（新建出来的那个就在这里）：一路往上的祖先都得展开，
  // 否则那一行藏在收起的父夹里。
  const forcedOpenIds = useMemo(
    () =>
      new Set([
        ...(activeId ? getFolderAncestorIds(folders, activeId) : []),
        ...(renamingId ? getFolderAncestorIds(folders, renamingId) : []),
      ]),
    [folders, activeId, renamingId],
  )
  const isExpanded = (id: string) =>
    expandedIds.has(id) || forcedOpenIds.has(id)

  const heightMotion = collapseMotion(reducedMotion)

  const expand = (ids: readonly string[]) =>
    setExpandedIds((prev) => withExpanded(prev, ids))

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

  /** Eagle 式新建：当场建一个「未命名文件夹」，建好那一行直接进改名。失败 = 什么都不留。 */
  const createUntitled = async (parentId: string | null) => {
    if (isCreating) return
    setIsSearching(false)
    setQuery('')
    setIsCreating(true)
    const created = await onCreate(t('folderUntitled'), parentId)
    setIsCreating(false)
    if (!created) return
    if (parentId) {
      expand([parentId, ...getFolderAncestorIds(folders, parentId)])
    }
    onRenamingChange(created.id)
  }

  const menuFor = (folder: ProjectRecord): AssetFolderMenuActions => ({
    onRename: () => onRenamingChange(folder.id),
    onTogglePin: () => onTogglePin(folder),
    onCreateChild: () => void createUntitled(folder.id),
    onMove: (parentId) => onMove(folder.id, parentId),
    onDelete: () => onRequestDelete(folder),
  })

  const commitRename = (folder: ProjectRecord, name: string | null) => {
    if (name && name !== folder.name) onRename(folder.id, name)
    // 改完名的那一行要一直看得见（新建时祖先只是临时撑开）。
    expand(getFolderAncestorIds(folders, folder.id))
    onRenamingChange(null)
  }

  // 一次拖动手势：按下记起点 → 拖出几像素才算拖 → 每次移动重新瞄准 → 松手落下。
  // ⚠ 只在按下时订阅一次；中途要的最新树 / 回调从 `latestRef` 取。
  useEffect(() => {
    if (!pending) return
    let started = false
    let target: FolderDropTarget | null = null
    let lineKey = ''
    let hoverId: string | null = null
    let hoverTimer: number | undefined
    let lastY = pending.y0
    let scrollFrame = 0

    const clearHover = () => {
      window.clearTimeout(hoverTimer)
      hoverId = null
    }

    const aim = (y: number) => {
      const tree = treeRef.current
      let next: FolderDropTarget | null = null
      let line: FolderDragState['line'] = null
      if (tree) {
        const treeRect = tree.getBoundingClientRect()
        const rows = tree.querySelectorAll<HTMLElement>('[data-folder-row]')
        for (const row of rows) {
          const rect = row.getBoundingClientRect()
          if (rect.height === 0 || y < rect.top || y > rect.bottom) continue
          next = resolveFolderDropTarget(
            latestRef.current.folders,
            pending.id,
            row.dataset.folderRow ?? '',
            (y - rect.top) / rect.height,
          )
          if (next && next.kind !== 'into') {
            const depth = Number(row.dataset.folderDepth ?? 0)
            line = {
              top:
                (next.kind === 'before' ? rect.top : rect.bottom) -
                treeRect.top,
              left: folderIndentPx('sidebar', depth) + DROP_LINE_LEAD_PX,
            }
          }
          break
        }
      }

      // 压在一个夹中间停一会儿 = 它自己展开（没有子夹的展开了也看不出，无妨）。
      if (next?.kind === 'into') {
        if (hoverId !== next.id) {
          clearHover()
          const id = next.id
          hoverId = id
          hoverTimer = window.setTimeout(
            () => setExpandedIds((prev) => withExpanded(prev, [id])),
            FOLDER_TREE_DRAG.hoverExpandMs,
          )
        }
      } else {
        clearHover()
      }

      const nextKey = line ? `${line.top}:${line.left}` : ''
      if (
        next?.kind !== target?.kind ||
        next?.id !== target?.id ||
        nextKey !== lineKey
      ) {
        target = next
        lineKey = nextKey
        setDrag({ id: pending.id, target: next, line })
      }
    }

    // 靠近栏的上 / 下边就一帧一帧往那边滚，滚动中按最后的指针位置重新瞄准。
    const autoScroll = () => {
      scrollFrame = 0
      const el = scrollRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const edge = FOLDER_TREE_DRAG.autoScrollEdgePx
      const nearTop = (rect.top + edge - lastY) / edge
      const nearBottom = (lastY - (rect.bottom - edge)) / edge
      const step =
        nearTop > 0
          ? -Math.min(nearTop, 1)
          : nearBottom > 0
            ? Math.min(nearBottom, 1)
            : 0
      if (step === 0) return
      const before = el.scrollTop
      el.scrollTop += step * FOLDER_TREE_DRAG.autoScrollMaxPx
      if (el.scrollTop === before) return
      aim(lastY)
      scrollFrame = window.requestAnimationFrame(autoScroll)
    }

    const finish = (commit: boolean) => {
      clearHover()
      window.cancelAnimationFrame(scrollFrame)
      if (started) {
        // pointerup 之后浏览器还会补一个 click —— 等它过去再放行。
        window.setTimeout(() => {
          dragGuardRef.current = false
        }, 0)
        const plan =
          commit && target
            ? planFolderDrop(latestRef.current.folders, pending.id, target)
            : null
        if (plan) {
          const parentId = plan.parentId
          if (parentId) {
            // 放进去的那个夹（和它的祖先）留在展开态，落下的那一行看得见。
            setExpandedIds((prev) =>
              withExpanded(prev, [
                parentId,
                ...getFolderAncestorIds(latestRef.current.folders, parentId),
              ]),
            )
          }
          latestRef.current.onPlace(plan)
          setLanded((prev) => ({ id: plan.id, tick: (prev?.tick ?? 0) + 1 }))
        }
      }
      setDrag(null)
      setPending(null)
    }

    const onMoveEvent = (event: PointerEvent) => {
      if (event.pointerId !== pending.pointerId) return
      if (!started) {
        const moved = Math.hypot(
          event.clientX - pending.x0,
          event.clientY - pending.y0,
        )
        if (moved < FOLDER_TREE_DRAG.activationPx) return
        started = true
        dragGuardRef.current = true
        setDrag({ id: pending.id, target: null, line: null })
      }
      ghostX.set(event.clientX + GHOST_OFFSET.x)
      ghostY.set(event.clientY + GHOST_OFFSET.y)
      lastY = event.clientY
      aim(event.clientY)
      if (!scrollFrame) scrollFrame = window.requestAnimationFrame(autoScroll)
    }
    const onUp = (event: PointerEvent) => {
      if (event.pointerId === pending.pointerId) finish(true)
    }
    const onCancel = (event: PointerEvent) => {
      if (event.pointerId === pending.pointerId) finish(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !started) return
      // ⚠ 捕获阶段拦下：页面的 Esc（回上一级）看到 defaultPrevented 就不动。
      event.preventDefault()
      event.stopPropagation()
      finish(false)
    }

    window.addEventListener('pointermove', onMoveEvent)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    window.addEventListener('keydown', onKeyDown, true)
    return () => {
      clearHover()
      window.cancelAnimationFrame(scrollFrame)
      window.removeEventListener('pointermove', onMoveEvent)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      window.removeEventListener('keydown', onKeyDown, true)
    }
  }, [pending, ghostX, ghostY])

  const startFolderDrag = (
    folder: ProjectRecord,
    event: React.PointerEvent<HTMLElement>,
  ) => {
    if (touch || renamingId || pending) return
    if (event.button !== 0 || event.pointerType === 'touch') return
    // ▸ / ⋯ / 输入框上按下不起拖。
    if ((event.target as HTMLElement).closest('[data-folder-nodrag]')) return
    setPending({
      id: folder.id,
      pointerId: event.pointerId,
      x0: event.clientX,
      y0: event.clientY,
    })
  }

  const draggedFolder = drag
    ? (folders.find((folder) => folder.id === drag.id) ?? null)
    : null

  const renderRow = (
    folder: ProjectRecord,
    options: { depth: number; group: 'tree' | 'pins' | 'search' },
  ): React.ReactNode => {
    const isTree = options.group === 'tree'
    const children = isTree ? getChildFolders(folders, folder.id) : []
    const expanded = children.length > 0 && isExpanded(folder.id)
    // ⚠ 改名只在树（或搜索结果）里那一行打字：置顶组里同一个夹也开一个输入框的话，
    // 两个 autoFocus 抢焦点，先失焦的那个当场把改名提交掉。
    const editing = renamingId === folder.id && options.group !== 'pins'
    const path =
      options.group === 'search' && folder.parentId
        ? getFolderPath(folders, folder.id)
            .slice(0, -1)
            .map((entry) => entry.name)
            .join(' / ')
        : undefined

    const rowProps: FolderRowProps = {
      folder,
      folders,
      depth: options.depth,
      path,
      active: activeId === folder.id,
      count: counts.byProject[folder.id],
      expandable: children.length > 0,
      expanded,
      onToggle: () => toggleExpanded(folder.id),
      onSelect: () => selectFolder(folder.id),
      editing,
      onRenameCommit: (name) => commitRename(folder, name),
      menu: menuFor(folder),
      touch,
      rowMotion: heightMotion,
      treeRow: isTree,
      onTreePointerDown: isTree
        ? (event) => startFolderDrag(folder, event)
        : undefined,
      lifted: isTree && drag?.id === folder.id,
      folderDropInto:
        isTree && drag?.target?.kind === 'into' && drag.target.id === folder.id,
      landTick:
        isTree && landed?.id === folder.id && !reducedMotion
          ? landed.tick
          : undefined,
      dropCount: draggingCount,
      isDropTarget: dropTargetId === `${options.group}:${folder.id}`,
      onDropTargetChange: (over) =>
        setDropTargetId((current) =>
          over
            ? `${options.group}:${folder.id}`
            : current === `${options.group}:${folder.id}`
              ? null
              : current,
        ),
      onDropAssets: (ids) => onDropAssets(folder.id, ids),
    }

    if (options.group === 'pins') {
      return (
        <SortablePinRow
          key={folder.id}
          disabled={touch || Boolean(renamingId) || editing}
          {...rowProps}
        />
      )
    }

    return (
      <FolderRow key={folder.id} {...rowProps}>
        {isTree ? (
          <AnimatePresence initial={false}>
            {expanded ? (
              <motion.div
                key="children"
                {...heightMotion}
                className="overflow-hidden"
              >
                <AnimatePresence initial={false}>
                  {children.map((child) =>
                    renderRow(child, {
                      depth: options.depth + 1,
                      group: 'tree',
                    }),
                  )}
                </AnimatePresence>
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
          disabled={
            isCreating || folders.length >= PROJECT.MAX_PROJECTS_PER_USER
          }
          onClick={() => void createUntitled(null)}
          className={cn(
            iconButton,
            iconSize,
            'disabled:pointer-events-none disabled:opacity-50',
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

      <div
        ref={scrollRef}
        className="studio-scrollbar -mx-1 min-h-0 flex-1 overflow-y-auto px-1"
      >
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
            <div ref={treeRef} role="tree" className="relative">
              <AnimatePresence initial={false}>
                {roots.map((folder) =>
                  renderRow(folder, { depth: 0, group: 'tree' }),
                )}
              </AnimatePresence>
              {drag?.line ? (
                <motion.div
                  aria-hidden
                  className="pointer-events-none absolute right-1 z-10 h-0.5 rounded-full bg-foreground"
                  initial={false}
                  animate={{ top: drag.line.top - 1, left: drag.line.left }}
                  transition={reducedMotion ? { duration: 0 } : SPRING.slot}
                >
                  <span className="absolute -left-1 -top-0.75 size-2 rounded-full bg-foreground" />
                </motion.div>
              ) : null}
            </div>
          </>
        )}
      </div>

      {/* 拿起来的那一行：跟着指针走的影子（挂到 body 上 —— 栏自己在一个带位移的
          容器里，fixed 定位会被它带偏）。 */}
      {draggedFolder && typeof document !== 'undefined'
        ? createPortal(
            <motion.div
              aria-hidden
              className="pointer-events-none fixed left-0 top-0 z-50 flex h-8.5 max-w-60 items-center gap-2 rounded-lg bg-background pl-2 pr-3 text-2sm font-medium text-foreground shadow-float"
              style={{ x: ghostX, y: ghostY }}
              initial={reducedMotion ? false : { scale: 1 }}
              animate={{
                scale: reducedMotion ? 1 : FOLDER_TREE_DRAG.liftScale,
              }}
              transition={SPRING.press}
            >
              <FolderCover url={draggedFolder.coverUrl} />
              <span className="min-w-0 truncate">{draggedFolder.name}</span>
            </motion.div>,
            document.body,
          )
        : null}
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
 * 置顶组：一组可拖动排序的行（dnd-kit）。拖出 4px 才算拖 —— 点一下仍是打开。
 * ⚠ 只在这一组里排；树里拖夹走的是 Eagle 式那一套（放进去 / 排到两行之间）。
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
    useSensor(PointerSensor, {
      activationConstraint: { distance: FOLDER_TREE_DRAG.activationPx },
    }),
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

/** 置顶组那一行的 dnd-kit 接线（树里的行不走它）。 */
interface SortableBinding {
  setNodeRef: (element: HTMLElement | null) => void
  setActivatorNodeRef: (element: HTMLElement | null) => void
  listeners: DraggableSyntheticListeners
  style: React.CSSProperties
  isDragging: boolean
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
  rowMotion: CollapseMotion
  /** 树里的行：能拖、是拖动的落点（`data-folder-row`）。 */
  treeRow: boolean
  onTreePointerDown?: (event: React.PointerEvent<HTMLElement>) => void
  /** 正被拖着（原位变淡）。 */
  lifted: boolean
  /** 拖着的夹压在它中间 = 要放进它（黑框）。 */
  folderDropInto: boolean
  /** 刚落下：短短一下弹簧落定（同一行再落一次 tick 会变）。 */
  landTick?: number
  sortable?: SortableBinding
  dropCount: number
  isDropTarget: boolean
  onDropTargetChange: (over: boolean) => void
  onDropAssets: (ids: string[]) => void
  children?: React.ReactNode
}

function SortablePinRow({
  disabled,
  ...props
}: FolderRowProps & { disabled: boolean }) {
  const sortableTransition = useSpringSortableTransition()
  const {
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: props.folder.id,
    disabled,
    transition: sortableTransition,
  })
  return (
    <FolderRow
      {...props}
      sortable={{
        setNodeRef,
        setActivatorNodeRef,
        listeners,
        isDragging,
        style: {
          // 只在竖直方向走：同一组里排顺序，不往旁边拖。
          transform: transform
            ? `translate3d(0, ${transform.y}px, 0)`
            : undefined,
          transition,
        },
      }}
    />
  )
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
  rowMotion,
  treeRow,
  onTreePointerDown,
  lifted,
  folderDropInto,
  landTick,
  sortable,
  dropCount,
  isDropTarget,
  onDropTargetChange,
  onDropAssets,
  children,
}: FolderRowProps) {
  const t = useTranslations('AssetsPage')
  const [menuOpen, setMenuOpen] = useState(false)
  /** 触屏长按：计时器 + 起点；到点弹菜单，接下来那一下 click 不算「打开这个夹」。 */
  const longPressRef = useRef<{
    timer: number
    x: number
    y: number
  } | null>(null)
  const longPressFiredRef = useRef(false)

  useEffect(
    () => () => {
      if (longPressRef.current) window.clearTimeout(longPressRef.current.timer)
    },
    [],
  )

  const cancelLongPress = () => {
    if (!longPressRef.current) return
    window.clearTimeout(longPressRef.current.timer)
    longPressRef.current = null
  }

  const hasAssets = (event: React.DragEvent) =>
    Array.from(event.dataTransfer.types).includes(ASSET_DND_MIME)

  const isDragging = sortable?.isDragging ?? false

  return (
    <motion.div {...rowMotion}>
      <div
        ref={sortable?.setNodeRef}
        style={sortable?.style}
        className={cn(
          'relative transition-opacity duration-fast',
          isDragging && 'z-10',
          lifted && 'opacity-40',
        )}
      >
        <motion.div
          key={landTick ?? 'still'}
          initial={
            landTick === undefined
              ? false
              : { scale: FOLDER_TREE_DRAG.liftScale }
          }
          animate={{ scale: 1 }}
          transition={SPRING.slot}
        >
          <div
            ref={sortable?.setActivatorNodeRef}
            {...sortable?.listeners}
            role="treeitem"
            aria-level={depth + 1}
            aria-selected={active}
            aria-expanded={expandable ? expanded : undefined}
            data-folder-row={treeRow ? folder.id : undefined}
            data-folder-depth={treeRow ? depth : undefined}
            // 层深是算出来的数，只能走行内样式（见 FOLDER_TREE_INDENT）。
            style={{ paddingLeft: folderIndentPx('sidebar', depth) }}
            onPointerDown={(event) => {
              sortable?.listeners?.onPointerDown?.(event)
              onTreePointerDown?.(event)
              if (event.pointerType !== 'touch' || editing) return
              cancelLongPress()
              longPressFiredRef.current = false
              longPressRef.current = {
                x: event.clientX,
                y: event.clientY,
                timer: window.setTimeout(() => {
                  longPressRef.current = null
                  longPressFiredRef.current = true
                  setMenuOpen(true)
                }, FOLDER_TREE_DRAG.longPressMs),
              }
            }}
            onPointerMove={(event) => {
              const press = longPressRef.current
              if (!press) return
              const moved = Math.hypot(
                event.clientX - press.x,
                event.clientY - press.y,
              )
              if (moved > FOLDER_TREE_DRAG.longPressSlopPx) cancelLongPress()
            }}
            onPointerUp={cancelLongPress}
            onPointerCancel={cancelLongPress}
            onClickCapture={(event) => {
              if (!longPressFiredRef.current) return
              // 长按弹了菜单：松手补的那一下 click 不算「打开这个夹」。
              longPressFiredRef.current = false
              event.preventDefault()
              event.stopPropagation()
            }}
            onContextMenu={(event) => {
              if (editing) return
              event.preventDefault()
              cancelLongPress()
              setMenuOpen(true)
            }}
            onKeyDown={(event) => {
              if (event.key !== 'F2' || editing) return
              event.preventDefault()
              menu.onRename()
            }}
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
              'group/row relative flex select-none items-center gap-2 rounded-lg pr-1 text-2sm transition-[background-color,box-shadow,scale] duration-fast',
              touch ? 'h-11' : 'h-8.5',
              editing
                ? 'bg-background ring-2 ring-inset ring-foreground'
                : isDropTarget || folderDropInto
                  ? 'bg-muted ring-2 ring-inset ring-foreground'
                  : active
                    ? 'bg-muted'
                    : 'hover:bg-muted/60',
              menuOpen && !active && 'bg-muted/60',
              isDragging && 'scale-102 bg-background shadow-lg',
            )}
          >
            {expandable ? (
              <button
                type="button"
                data-folder-nodrag
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
              <span
                data-folder-nodrag
                className="flex min-w-0 flex-1 items-center gap-2"
              >
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
                onDoubleClick={menu.onRename}
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
                data-folder-nodrag
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
                  open={menuOpen}
                  onOpenChange={setMenuOpen}
                  showRenameShortcut={!touch}
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
        </motion.div>
        {children}
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
        // F2 / 快捷键别冒到行上。
        event.stopPropagation()
        if (event.key === 'Enter') {
          event.preventDefault()
          finish(event.currentTarget.value)
        } else if (event.key === 'Escape') {
          event.preventDefault()
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
