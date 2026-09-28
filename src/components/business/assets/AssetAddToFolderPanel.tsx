'use client'

import { useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import {
  Check,
  ChevronRight,
  Folder,
  Minus,
  Plus,
  Search,
} from '@/components/icons'
import { ASSET_FOLDER_UNDO_DURATION_MS } from '@/constants/assets-grid'
import { PROJECT } from '@/constants/config'
import { getFolderMembershipsAPI, updateFolderItemsAPI } from '@/lib/api-client'
import {
  filterFolders,
  getChildFolders,
  getFolderPath,
  getRootFolders,
} from '@/lib/folder-tree'
import { cn } from '@/lib/utils'
import type { ProjectRecord } from '@/types'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Spinner } from '@/components/ui/spinner'
import { getChipZoomMotion } from '@/components/business/studio-shared/primitives/tool-surface'

type Memberships = Record<string, string[]>

/** 这个面板开着期间每个夹的净变化 —— 关上时的那一条「撤销」按它往回写。 */
interface FolderChange {
  name: string
  added: Set<string>
  removed: Set<string>
}

interface AssetAddToFolderPanelProps {
  assetIds: string[]
  folders: ProjectRecord[]
  counts?: Record<string, number>
  /** 「新建文件夹并放进去」：在最外层建一个。 */
  onCreateFolder: (name: string) => Promise<ProjectRecord | null>
  /** 每次放进 / 拿出落库之后：这几张现在各在哪些夹里（大河、计数跟着变）。 */
  onChanged: (memberships: Memberships) => void
  /** 撤销落库之后（大河重拉一遍）。 */
  onUndone: () => void
  trigger: React.ReactNode
  side?: 'top' | 'bottom'
  align?: 'start' | 'center' | 'end'
}

/**
 * 加入文件夹（画板 `AfAdd`，三个方向共用）：一张图可以同时在好几个夹里。
 *
 * 勾上 = 选中的全部放进去，再点 = 从这个夹拿出（⛔ 不删图）；半勾 = 只有几张在。
 * 点一下就落库，⛔ 没有「确定」；关上面板后底部出一条「已放进「三视图」· 撤销」。
 */
export function AssetAddToFolderPanel({
  assetIds,
  folders,
  counts,
  onCreateFolder,
  onChanged,
  onUndone,
  trigger,
  side = 'top',
  align = 'center',
}: AssetAddToFolderPanelProps) {
  const t = useTranslations('AssetsPage')
  const [open, setOpen] = useState(false)
  const [memberships, setMemberships] = useState<Memberships | null>(null)
  const [query, setQuery] = useState('')
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set())
  const [isCreating, setIsCreating] = useState(false)
  const changesRef = useRef(new Map<string, FolderChange>())
  const zoom = getChipZoomMotion({ side, align, sideOffset: 8 })

  const stateOf = (folderId: string): 'all' | 'some' | 'none' => {
    if (!memberships) return 'none'
    const inside = assetIds.filter((id) => memberships[id]?.includes(folderId))
    if (inside.length === 0) return 'none'
    return inside.length === assetIds.length ? 'all' : 'some'
  }

  const roots = useMemo(() => getRootFolders(folders), [folders])
  const matches = useMemo(
    () => (query.trim() ? filterFolders(folders, query) : []),
    [folders, query],
  )

  const loadMemberships = async () => {
    setMemberships(null)
    const response = await getFolderMembershipsAPI(assetIds)
    if (!response.success || !response.data) {
      toast.error(t('addToFolderFailed'))
      return
    }
    const loaded = response.data
    setMemberships(loaded)
    // 有几张已经在子夹里的父夹先展开，别让半勾藏在收起的一行下面。
    setExpandedIds(
      new Set(
        roots
          .filter((root) =>
            getChildFolders(folders, root.id).some((child) =>
              assetIds.some((id) => loaded[id]?.includes(child.id)),
            ),
          )
          .map((root) => root.id),
      ),
    )
  }

  const record = (
    folder: ProjectRecord,
    kind: 'added' | 'removed',
    ids: string[],
  ) => {
    const change = changesRef.current.get(folder.id) ?? {
      name: folder.name,
      added: new Set<string>(),
      removed: new Set<string>(),
    }
    const [same, opposite] =
      kind === 'added'
        ? [change.added, change.removed]
        : [change.removed, change.added]
    for (const id of ids) {
      if (opposite.has(id)) opposite.delete(id)
      else same.add(id)
    }
    changesRef.current.set(folder.id, change)
  }

  const apply = (next: Memberships) => {
    setMemberships(next)
    onChanged(next)
  }

  const toggle = async (folder: ProjectRecord) => {
    if (!memberships) return
    const removing = stateOf(folder.id) === 'all'
    const before = memberships
    const optimistic: Memberships = Object.fromEntries(
      assetIds.map((id) => {
        const current = before[id] ?? []
        return [
          id,
          removing
            ? current.filter((folderId) => folderId !== folder.id)
            : current.includes(folder.id)
              ? current
              : [...current, folder.id],
        ]
      }),
    )
    setMemberships(optimistic)
    const response = await updateFolderItemsAPI(
      folder.id,
      removing ? { remove: assetIds } : { add: assetIds },
    )
    if (!response.success || !response.data) {
      setMemberships(before)
      toast.error(t('addToFolderFailed'))
      return
    }
    record(
      folder,
      removing ? 'removed' : 'added',
      removing ? response.data.removed : response.data.added,
    )
    apply(optimistic)
  }

  const createAndAdd = async (name: string | null) => {
    setIsCreating(false)
    if (!name || !memberships) return
    const folder = await onCreateFolder(name)
    if (!folder) return
    const response = await updateFolderItemsAPI(folder.id, { add: assetIds })
    if (!response.success || !response.data) {
      toast.error(t('addToFolderFailed'))
      return
    }
    record(folder, 'added', response.data.added)
    apply(
      Object.fromEntries(
        assetIds.map((id) => [id, [...(memberships[id] ?? []), folder.id]]),
      ),
    )
  }

  /** 关上面板：有净变化就给一条带撤销的提示（6 秒）。 */
  const settle = () => {
    const changes = [...changesRef.current.entries()].filter(
      ([, change]) => change.added.size > 0 || change.removed.size > 0,
    )
    changesRef.current = new Map()
    if (changes.length === 0) return

    const addedOnly = changes.every(([, change]) => change.removed.size === 0)
    const removedOnly = changes.every(([, change]) => change.added.size === 0)
    const message =
      addedOnly && changes.length === 1
        ? t('addToFolderDone', { name: changes[0][1].name })
        : addedOnly
          ? t('addToFolderDoneMany', { count: changes.length })
          : removedOnly && changes.length === 1
            ? t('addToFolderRemoved', { name: changes[0][1].name })
            : t('addToFolderUpdated')

    const undo = async () => {
      const results = await Promise.all(
        changes.map(([folderId, change]) =>
          updateFolderItemsAPI(folderId, {
            ...(change.added.size > 0 && { remove: [...change.added] }),
            ...(change.removed.size > 0 && { add: [...change.removed] }),
          }),
        ),
      )
      if (results.some((result) => !result.success)) {
        toast.error(t('addToFolderFailed'))
      } else {
        toast.success(t('addToFolderUndone'))
      }
      onUndone()
    }

    toast.success(message, {
      duration: ASSET_FOLDER_UNDO_DURATION_MS,
      action: { label: t('addToFolderUndo'), onClick: () => void undo() },
    })
  }

  const renderRow = (folder: ProjectRecord, depth: 0 | 1, path?: string) => {
    const state = stateOf(folder.id)
    const children =
      depth === 0 && !path ? getChildFolders(folders, folder.id) : []
    const expanded = children.length > 0 && expandedIds.has(folder.id)
    return (
      <div key={folder.id}>
        <div
          className={cn(
            'flex h-8.5 items-center gap-2 rounded-lg pr-2 transition-colors duration-fast hover:bg-muted/60',
            depth === 1 ? 'pl-6' : 'pl-1',
          )}
        >
          {children.length > 0 ? (
            <button
              type="button"
              aria-label={expanded ? t('folderCollapse') : t('folderExpand')}
              aria-expanded={expanded}
              onClick={() =>
                setExpandedIds((prev) => {
                  const next = new Set(prev)
                  if (next.has(folder.id)) next.delete(folder.id)
                  else next.add(folder.id)
                  return next
                })
              }
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
          <button
            type="button"
            role="menuitemcheckbox"
            aria-checked={
              state === 'all' ? true : state === 'some' ? 'mixed' : false
            }
            disabled={!memberships}
            onClick={() => void toggle(folder)}
            className="flex h-full min-w-0 flex-1 items-center gap-2 text-left text-2sm font-medium text-foreground disabled:opacity-60"
          >
            <span
              aria-hidden
              className={cn(
                'grid size-4 shrink-0 place-items-center rounded-sm text-background transition-colors duration-fast',
                state === 'none'
                  ? 'ring-1 ring-inset ring-muted-foreground/50'
                  : 'bg-foreground',
              )}
            >
              {state === 'all' ? (
                <Check className="size-2.75" />
              ) : state === 'some' ? (
                <Minus className="size-2.75" />
              ) : null}
            </span>
            {folder.coverUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- R2 缩略图，已是小图
              <img
                src={folder.coverUrl}
                alt=""
                loading="lazy"
                className="size-5 shrink-0 rounded-sm object-cover ring-1 ring-border"
              />
            ) : (
              <span className="grid size-5 shrink-0 place-items-center rounded-sm bg-muted text-muted-foreground">
                <Folder className="size-3" />
              </span>
            )}
            <span className="min-w-0 flex-1 truncate">{folder.name}</span>
            {path ? (
              <span className="max-w-24 shrink-0 truncate text-2xs font-normal text-muted-foreground">
                {path}
              </span>
            ) : typeof counts?.[folder.id] === 'number' ? (
              <span className="shrink-0 font-mono text-2xs font-normal text-muted-foreground tabular-nums">
                {counts[folder.id]}
              </span>
            ) : null}
          </button>
        </div>
        {expanded ? children.map((child) => renderRow(child, 1)) : null}
      </div>
    )
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) {
          setQuery('')
          setIsCreating(false)
          void loadMemberships()
        } else {
          settle()
        }
      }}
    >
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        side={side}
        align={align}
        sideOffset={8}
        collisionPadding={12}
        aria-label={t('addToFolder')}
        className={cn(
          'flex w-90 flex-col gap-0.5 rounded-2xl p-2.5',
          zoom.className,
        )}
        style={zoom.style}
      >
        <div className="flex items-baseline gap-2 px-1.5 pb-2 pt-1">
          <span className="text-sm font-semibold text-foreground">
            {t('addToFolder')}
          </span>
          {assetIds.length > 1 ? (
            <span className="text-xs text-muted-foreground">
              {t('selectedCount', { count: assetIds.length })}
            </span>
          ) : null}
          <span className="flex-1" />
          {memberships ? null : <Spinner size="sm" />}
        </div>
        <label className="flex h-9 shrink-0 items-center gap-2 rounded-lg bg-muted px-2.5 text-muted-foreground">
          <Search className="size-3.5 shrink-0" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('folderSearchPlaceholder')}
            aria-label={t('folderSearch')}
            className="min-w-0 flex-1 bg-transparent text-2sm text-foreground outline-none placeholder:text-muted-foreground/80"
          />
        </label>
        <div
          role="menu"
          className="studio-scrollbar -mx-1 mt-1 max-h-80 overflow-y-auto px-1"
        >
          {query.trim() ? (
            matches.length === 0 ? (
              <p className="px-2 py-4 text-center text-2sm text-muted-foreground">
                {t('folderSearchEmpty')}
              </p>
            ) : (
              matches.map((folder) =>
                renderRow(
                  folder,
                  0,
                  folder.parentId
                    ? getFolderPath(folders, folder.id)
                        .slice(0, -1)
                        .map((entry) => entry.name)
                        .join(' / ')
                    : undefined,
                ),
              )
            )
          ) : (
            roots.map((folder) => renderRow(folder, 0))
          )}
        </div>
        <div className="flex flex-wrap gap-x-3.5 gap-y-1 px-1.5 pt-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="grid size-3.5 place-items-center rounded-sm bg-foreground text-background">
              <Check className="size-2.5" />
            </span>
            {assetIds.length > 1
              ? t('addToFolderLegendAll', { count: assetIds.length })
              : t('addToFolderLegendIn')}
          </span>
          {assetIds.length > 1 ? (
            <span className="inline-flex items-center gap-1.5">
              <span className="grid size-3.5 place-items-center rounded-sm bg-foreground text-background">
                <Minus className="size-2.5" />
              </span>
              {t('addToFolderLegendSome')}
            </span>
          ) : null}
          <span>{t('addToFolderLegendHint')}</span>
        </div>
        <div className="mt-2 flex items-center border-t border-border/60 px-0.5 pt-2">
          {isCreating ? (
            <label className="flex h-8.5 flex-1 items-center gap-2 rounded-lg px-2 ring-2 ring-inset ring-foreground">
              <Folder className="size-3.5 shrink-0 text-muted-foreground" />
              <input
                autoFocus
                defaultValue={t('folderNewName')}
                maxLength={PROJECT.NAME_MAX_LENGTH}
                aria-label={t('folderRenameInput')}
                onFocus={(event) => event.currentTarget.select()}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    void createAndAdd(event.currentTarget.value.trim() || null)
                  } else if (event.key === 'Escape') {
                    event.preventDefault()
                    event.stopPropagation()
                    setIsCreating(false)
                  }
                }}
                onBlur={() => setIsCreating(false)}
                className="min-w-0 flex-1 bg-transparent text-2sm font-medium text-foreground outline-none"
              />
            </label>
          ) : (
            <button
              type="button"
              disabled={
                !memberships || folders.length >= PROJECT.MAX_PROJECTS_PER_USER
              }
              onClick={() => setIsCreating(true)}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-2sm font-medium text-foreground ring-1 ring-inset ring-border transition-colors duration-fast hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
            >
              <Plus className="size-3.5" />
              {t('addToFolderCreate')}
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
