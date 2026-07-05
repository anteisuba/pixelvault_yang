'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  CheckCircle2,
  FolderX,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react'
import { useTranslations } from 'next-intl'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { TreeView, type TreeNode } from '@/components/ui/tree-view'
import { ProjectCreateDialog } from '@/components/business/ProjectCreateDialog'
import { ASSET_DND_MIME } from '@/constants/asset-dnd'
import { cn } from '@/lib/utils'
import { focusUnlessTouch } from '@/lib/touch'
import type { ProjectRecord } from '@/types'

/**
 * AssetFolderTree — the /assets right-rail folder tree, extracted from the
 * KreaAssetBrowser monolith (Slice 1 of the素材中枢 rework).
 *
 * Reuses the shared `TreeView` primitive (which already provides the MagicUI
 * File Tree structure: motion expand/collapse, indent guide lines, folder
 * open/closed icons) and reskins it to the darkroom-achromatic language:
 * selection = a sunken well + left tick (no primary tint), counts = a
 * right-aligned monospace ledger column, and the "unassigned" bucket is a
 * dedicated amber to-do row above the tree rather than a tree node.
 *
 * The view group (all / favorites / published / uploads) is NOT owned here —
 * it moves to the top bar in a later slice. This component is folders only.
 *
 * Rename edit state is local; the actual persistence (updateProject +
 * refreshCounts) and the delete-confirm flow stay with the parent through
 * `onRenameProject` / `onRequestDeleteProject`.
 */

interface FolderNodeData {
  project: ProjectRecord
  count?: number
}

interface AssetFolderTreeProps {
  projects: ProjectRecord[]
  /** counts?.byProject — per-project asset counts keyed by project id. */
  byProjectCounts?: Record<string, number>
  /** Live total for the currently-open project (fallback before counts refresh). */
  activeProjectTotal?: number
  unassignedCount?: number
  activeProjectId: string | null
  isUnassignedActive: boolean
  onSelectUnassigned: () => void
  onSelectProject: (projectId: string) => void
  onProjectCreated: (project: ProjectRecord) => void
  /** Persist a rename. Returns true on success so the inline form can close. */
  onRenameProject: (id: string, newName: string) => Promise<boolean>
  onRequestDeleteProject: (id: string, name: string) => void
  /**
   * Drop handler for assets dragged from the grid onto a folder. `projectId`
   * is null when dropped on the "unassigned" bucket. When omitted, drop
   * targets are disabled.
   */
  onDropAssets?: (projectId: string | null, ids: string[]) => void
  className?: string
}

const UNASSIGNED_DROP_ID = '__unassigned__'

/** Parse the asset-id payload from a folder drop event, or null if absent. */
function readDroppedAssetIds(event: React.DragEvent): string[] | null {
  const raw = event.dataTransfer.getData(ASSET_DND_MIME)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : null
  } catch {
    return null
  }
}

function collectExpandedFolderIds(nodes: TreeNode<FolderNodeData>[]): string[] {
  const ids: string[] = []
  const visit = (node: TreeNode<FolderNodeData>) => {
    if (node.children && node.children.length > 0) {
      ids.push(node.id)
      node.children.forEach(visit)
    }
  }
  nodes.forEach(visit)
  return ids
}

export function AssetFolderTree({
  projects,
  byProjectCounts,
  activeProjectTotal,
  unassignedCount,
  activeProjectId,
  isUnassignedActive,
  onSelectUnassigned,
  onSelectProject,
  onProjectCreated,
  onRenameProject,
  onRequestDeleteProject,
  onDropAssets,
  className,
}: AssetFolderTreeProps) {
  const t = useTranslations('AssetsPage')

  const [editingProjectId, setEditingProjectId] = useState<string | null>(null)
  const [editingProjectName, setEditingProjectName] = useState('')
  const [renamingProjectId, setRenamingProjectId] = useState<string | null>(
    null,
  )
  // Which drop target is currently under the drag (project id, or the
  // unassigned sentinel). Drives the drop-target highlight.
  const [dragOverId, setDragOverId] = useState<string | null>(null)

  const dndEnabled = Boolean(onDropAssets)

  const handleFolderDragOver = useCallback(
    (node: TreeNode<FolderNodeData>, event: React.DragEvent) => {
      if (!dndEnabled || !event.dataTransfer.types.includes(ASSET_DND_MIME)) {
        return
      }
      const projectId = node.data?.project?.id
      if (!projectId) return
      event.preventDefault()
      event.dataTransfer.dropEffect = 'move'
      setDragOverId(projectId)
    },
    [dndEnabled],
  )

  const handleFolderDragLeave = useCallback(
    (node: TreeNode<FolderNodeData>, event: React.DragEvent) => {
      // Ignore leaves that only cross into a child element of the same row.
      if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
        return
      }
      const projectId = node.data?.project?.id
      setDragOverId((current) => (current === projectId ? null : current))
    },
    [],
  )

  const handleFolderDrop = useCallback(
    (node: TreeNode<FolderNodeData>, event: React.DragEvent) => {
      const projectId = node.data?.project?.id
      if (!dndEnabled || !projectId) return
      const ids = readDroppedAssetIds(event)
      setDragOverId(null)
      if (!ids) return
      event.preventDefault()
      onDropAssets?.(projectId, ids)
    },
    [dndEnabled, onDropAssets],
  )

  const startRename = (id: string, currentName: string) => {
    setEditingProjectId(id)
    setEditingProjectName(currentName)
  }

  const cancelRename = () => {
    setEditingProjectId(null)
    setEditingProjectName('')
  }

  const submitRename = async (id: string, currentName: string) => {
    if (renamingProjectId) return
    const trimmed = editingProjectName.trim()
    if (!trimmed) return
    if (trimmed === currentName) {
      cancelRename()
      return
    }
    setRenamingProjectId(id)
    try {
      const ok = await onRenameProject(id, trimmed)
      if (ok) cancelRename()
    } finally {
      setRenamingProjectId(null)
    }
  }

  const folderTreeData = useMemo<TreeNode<FolderNodeData>[]>(() => {
    const projectNodes = new Map<string, TreeNode<FolderNodeData>>()
    const roots: TreeNode<FolderNodeData>[] = []

    projects.forEach((project) => {
      projectNodes.set(project.id, {
        id: project.id,
        label: project.name,
        children: [],
        data: {
          project,
          count:
            byProjectCounts?.[project.id] ??
            (activeProjectId === project.id ? activeProjectTotal : undefined),
        },
      })
    })

    projects.forEach((project) => {
      const node = projectNodes.get(project.id)
      if (!node) return
      const parent = project.parentId
        ? projectNodes.get(project.parentId)
        : undefined
      if (parent) parent.children = [...(parent.children ?? []), node]
      else roots.push(node)
    })

    return roots
  }, [projects, byProjectCounts, activeProjectId, activeProjectTotal])

  const expandedFolderIds = useMemo(
    () => collectExpandedFolderIds(folderTreeData),
    [folderTreeData],
  )
  const selectedFolderIds = activeProjectId ? [activeProjectId] : []

  const handleNodeClick = useCallback(
    (node: TreeNode<FolderNodeData>) => {
      if (node.data?.project) onSelectProject(node.data.project.id)
    },
    [onSelectProject],
  )

  return (
    <section
      className={cn('grid gap-1.5', className)}
      aria-label={t('sidebarFolders')}
    >
      <div className="flex min-h-7 items-center justify-between gap-2 px-2">
        <span className="text-2xs font-medium uppercase tracking-wide text-muted-foreground/70">
          {t('sidebarFolders')}
        </span>
        <ProjectCreateDialog
          onCreated={onProjectCreated}
          trigger={
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              aria-label={t('folderCreate')}
              className="text-muted-foreground hover:text-foreground"
            >
              <Plus className="size-3.5" />
            </Button>
          }
        />
      </div>

      {/* Unassigned = dedicated amber to-do row (not a tree node). */}
      <button
        type="button"
        onClick={onSelectUnassigned}
        aria-pressed={isUnassignedActive}
        onDragOver={
          dndEnabled
            ? (event) => {
                if (!event.dataTransfer.types.includes(ASSET_DND_MIME)) return
                event.preventDefault()
                event.dataTransfer.dropEffect = 'move'
                setDragOverId(UNASSIGNED_DROP_ID)
              }
            : undefined
        }
        onDragLeave={
          dndEnabled
            ? (event) => {
                if (
                  event.currentTarget.contains(
                    event.relatedTarget as Node | null,
                  )
                ) {
                  return
                }
                setDragOverId((current) =>
                  current === UNASSIGNED_DROP_ID ? null : current,
                )
              }
            : undefined
        }
        onDrop={
          dndEnabled
            ? (event) => {
                const ids = readDroppedAssetIds(event)
                setDragOverId(null)
                if (!ids) return
                event.preventDefault()
                onDropAssets?.(null, ids)
              }
            : undefined
        }
        className={cn(
          'group/unassigned relative mx-1 flex items-center gap-2 rounded-lg py-1.5 pl-3 pr-2 text-sm transition-colors',
          'before:absolute before:left-1 before:top-1/2 before:h-5 before:w-0.5 before:-translate-y-1/2 before:rounded-full before:transition-colors',
          dragOverId === UNASSIGNED_DROP_ID &&
            'bg-amber-500/15 text-amber-100 ring-1 ring-inset ring-amber-400/50',
          isUnassignedActive
            ? 'bg-amber-500/12 text-amber-100 before:bg-amber-500'
            : 'text-amber-200/70 before:bg-amber-500/40 hover:bg-amber-500/10 hover:text-amber-100',
        )}
      >
        <FolderX className="size-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate text-left">
          {t('sidebarUnassigned')}
        </span>
        {typeof unassignedCount === 'number' && (
          <span className="shrink-0 font-mono text-3xs tabular-nums text-amber-200/70">
            {unassignedCount}
          </span>
        )}
      </button>

      <TreeView
        key={expandedFolderIds.join('|')}
        data={folderTreeData}
        selectedIds={selectedFolderIds}
        defaultExpandedIds={expandedFolderIds}
        onNodeClick={handleNodeClick}
        onNodeDragOver={dndEnabled ? handleFolderDragOver : undefined}
        onNodeDragLeave={dndEnabled ? handleFolderDragLeave : undefined}
        onNodeDrop={dndEnabled ? handleFolderDrop : undefined}
        showLines
        animateExpand
        className="min-w-0 max-w-full overflow-hidden"
        getRowClassName={(node, state) =>
          cn(
            'before:absolute before:left-1 before:top-1/2 before:h-5 before:w-0.5 before:-translate-y-1/2 before:rounded-full before:transition-colors',
            node.id === dragOverId &&
              'bg-muted/60 ring-1 ring-inset ring-foreground/40',
            state.isSelected
              ? 'bg-muted/70 text-foreground before:bg-foreground'
              : 'text-foreground/80 before:bg-transparent hover:bg-muted/40 hover:text-foreground',
          )
        }
        renderNodeContent={(node, state) => {
          const project = node.data?.project
          const count = node.data?.count
          if (project && editingProjectId === project.id) {
            return (
              <ProjectRenameTreeContent
                value={editingProjectName}
                disabled={renamingProjectId === project.id}
                inputLabel={t('folderRenameInput')}
                saveLabel={t('folderRenameSave')}
                cancelLabel={t('folderRenameCancel')}
                onChange={setEditingProjectName}
                onSubmit={() => void submitRename(project.id, project.name)}
                onCancel={cancelRename}
              />
            )
          }

          return (
            <>
              <span className="min-w-0 flex-1 truncate">{node.label}</span>
              {typeof count === 'number' && (
                <span
                  className={cn(
                    'ml-2 shrink-0 font-mono text-3xs tabular-nums group-hover/tree-node:hidden',
                    state.isSelected
                      ? 'text-foreground/80'
                      : 'text-muted-foreground/70',
                  )}
                >
                  {count}
                </span>
              )}
              {project && (
                <span className="ml-1 hidden shrink-0 items-center gap-0.5 group-hover/tree-node:flex focus-within:flex">
                  <ProjectCreateDialog
                    parentId={project.id}
                    onCreated={onProjectCreated}
                    trigger={
                      <button
                        type="button"
                        aria-label={t('folderCreate')}
                        title={t('folderCreate')}
                        onClick={(event) => event.stopPropagation()}
                        className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
                      >
                        <Plus className="size-3" />
                      </button>
                    }
                  />
                  <button
                    type="button"
                    aria-label={t('folderRename')}
                    title={t('folderRename')}
                    onClick={(event) => {
                      event.stopPropagation()
                      startRename(project.id, project.name)
                    }}
                    className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
                  >
                    <Pencil className="size-3" />
                  </button>
                  <button
                    type="button"
                    aria-label={t('folderDelete')}
                    title={t('folderDelete')}
                    onClick={(event) => {
                      event.stopPropagation()
                      onRequestDeleteProject(project.id, project.name)
                    }}
                    className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="size-3" />
                  </button>
                </span>
              )}
            </>
          )
        }}
      />
    </section>
  )
}

interface ProjectRenameTreeContentProps {
  value: string
  disabled: boolean
  inputLabel: string
  saveLabel: string
  cancelLabel: string
  onChange: (value: string) => void
  onSubmit: () => void
  onCancel: () => void
}

function ProjectRenameTreeContent({
  value,
  disabled,
  inputLabel,
  saveLabel,
  cancelLabel,
  onChange,
  onSubmit,
  onCancel,
}: ProjectRenameTreeContentProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    focusUnlessTouch(inputRef.current, { select: true })
  }, [])

  return (
    <form
      onClick={(event) => event.stopPropagation()}
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit()
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          onCancel()
        }
      }}
      className="flex min-w-0 flex-1 items-center gap-1"
    >
      <Input
        ref={inputRef}
        value={value}
        disabled={disabled}
        maxLength={60}
        aria-label={inputLabel}
        onChange={(event) => onChange(event.target.value)}
        className="h-7 min-w-0 flex-1 rounded-md bg-background px-2 text-sm"
      />
      <button
        type="submit"
        aria-label={saveLabel}
        title={saveLabel}
        disabled={disabled || value.trim().length === 0}
        className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
      >
        {disabled ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <CheckCircle2 className="size-3.5" />
        )}
      </button>
      <button
        type="button"
        aria-label={cancelLabel}
        title={cancelLabel}
        disabled={disabled}
        onClick={onCancel}
        className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
      >
        <X className="size-3.5" />
      </button>
    </form>
  )
}
