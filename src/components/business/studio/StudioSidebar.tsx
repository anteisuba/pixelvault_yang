'use client'

import { memo, useCallback, useMemo, useState } from 'react'
import {
  Key,
  Folder,
  FolderOpen,
  FolderPlus,
  Images,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
  Gift,
} from 'lucide-react'
import { useTranslations } from 'next-intl'

import { assignToProjectAPI } from '@/lib/api-client'
import { useStudioData, useStudioForm } from '@/contexts/studio-context'
import { useApiKeysContext } from '@/contexts/api-keys-context'
import { useImageModelOptions } from '@/hooks/use-image-model-options'
import { useUsageSummary } from '@/hooks/use-usage-summary'
import { TreeView } from '@/components/ui/tree-view'
import type { ProjectRecord } from '@/types'
import { Sidebar, SidebarContent, SidebarFooter } from '@/components/ui/sidebar'
import { cn } from '@/lib/utils'

// ─── Project name → Tree structure ──────────────────────────────

interface TreeItem {
  id: string
  name: string
  icon?: React.ComponentType<{ className?: string }>
  selectedIcon?: React.ComponentType<{ className?: string }>
  openIcon?: React.ComponentType<{ className?: string }>
  children?: TreeItem[]
  actions?: React.ReactNode
  onClick?: () => void
  droppable?: boolean
}

function ProjectActions({
  projectId,
  projectName,
  onRename,
  onAddSub,
  onDelete,
}: {
  projectId: string
  projectName: string
  onRename: (id: string, name: string) => void
  onAddSub: (parentName: string) => void
  onDelete: (id: string) => void
}) {
  return (
    <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          const newName = prompt('Rename project:', projectName)
          if (newName?.trim()) onRename(projectId, newName.trim())
        }}
        className="flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
        title="Rename"
      >
        <Pencil className="size-2.5" />
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onAddSub(projectName)
        }}
        className="flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
        title="Add sub-project"
      >
        <FolderPlus className="size-2.5" />
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onDelete(projectId)
        }}
        className="flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        title="Delete"
      >
        <Trash2 className="size-2.5" />
      </button>
    </div>
  )
}

function buildProjectTree(
  projects: ProjectRecord[],
  onSelect: (id: string) => void,
  onRename: (id: string, name: string) => void,
  onAddSub: (parentName: string) => void,
  onDelete: (id: string) => void,
): TreeItem[] {
  const roots: TreeItem[] = []
  const nodeMap = new Map<string, TreeItem>()

  const sorted = [...projects].sort((a, b) => a.name.localeCompare(b.name))

  for (const project of sorted) {
    const parts = project.name.split(' / ').map((p) => p.trim())

    const node: TreeItem = {
      id: project.id,
      name: parts[parts.length - 1],
      icon: Folder,
      selectedIcon: FolderOpen,
      openIcon: FolderOpen,
      onClick: () => onSelect(project.id),
      droppable: true,
      children: [],
      actions: (
        <ProjectActions
          projectId={project.id}
          projectName={project.name}
          onRename={onRename}
          onAddSub={onAddSub}
          onDelete={onDelete}
        />
      ),
    }

    if (parts.length === 1) {
      roots.push(node)
      nodeMap.set(project.name, node)
    } else {
      const parentName = parts.slice(0, -1).join(' / ')
      const parent = nodeMap.get(parentName)

      if (parent) {
        if (!parent.children) parent.children = []
        parent.children.push(node)
      } else {
        node.name = project.name
        roots.push(node)
      }
      nodeMap.set(project.name, node)
    }
  }

  function cleanEmpty(items: TreeItem[]) {
    for (const item of items) {
      if (item.children?.length === 0) delete item.children
      else if (item.children) cleanEmpty(item.children)
    }
  }
  cleanEmpty(roots)

  return roots
}

// ─── Component ──────────────────────────────────────────────────

export const StudioSidebar = memo(function StudioSidebar() {
  const { projects } = useStudioData()
  const { state, dispatch } = useStudioForm()
  const { keys, healthMap } = useApiKeysContext()
  const { modelOptions } = useImageModelOptions()
  const { summary } = useUsageSummary()
  const t = useTranslations('StudioV3')

  const activeKeys = keys.filter((k) => k.isActive)

  const handleSelectProject = useCallback(
    (id: string) => {
      projects.setActiveProjectId(id)
    },
    [projects],
  )

  const handleRenameProject = useCallback(
    (id: string, newName: string) => {
      void projects.update(id, { name: newName })
    },
    [projects],
  )

  const handleAddSubProject = useCallback(
    (parentName: string) => {
      void projects.create({ name: `${parentName} / ${t('newProject')}` })
    },
    [projects, t],
  )

  const handleDeleteProject = useCallback(
    (id: string) => {
      void projects.remove(id)
    },
    [projects],
  )

  // ── Drag & Drop: move generation to project ───────────────────

  const [dropTargetId, setDropTargetId] = useState<string | null>(null)

  const handleDragOver = useCallback(
    (e: React.DragEvent, projectId: string | null) => {
      if (e.dataTransfer.types.includes('application/x-studio-ref')) {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
        setDropTargetId(projectId)
      }
    },
    [],
  )

  const handleDragLeave = useCallback(() => {
    setDropTargetId(null)
  }, [])

  const handleDrop = useCallback(
    async (e: React.DragEvent, projectId: string | null) => {
      e.preventDefault()
      setDropTargetId(null)

      const raw = e.dataTransfer.getData('application/x-studio-ref')
      if (!raw) return

      try {
        const { id: generationId } = JSON.parse(raw) as { id: string }
        if (!generationId) return
        await assignToProjectAPI(generationId, projectId)
        void projects.refresh()
      } catch {
        // silently fail
      }
    },
    [projects],
  )

  const treeData = useMemo(
    () =>
      buildProjectTree(
        projects.projects,
        handleSelectProject,
        handleRenameProject,
        handleAddSubProject,
        handleDeleteProject,
      ),
    [
      projects.projects,
      handleSelectProject,
      handleRenameProject,
      handleAddSubProject,
      handleDeleteProject,
    ],
  )

  return (
    <Sidebar
      collapsible="offcanvas"
      className="border-r border-border/50 !top-14 !h-[calc(100svh-3.5rem)]"
    >
      <SidebarContent className="flex flex-col">
        {/* ── Header ─────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-3 py-2.5">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t('projects')}
          </h2>
          <button
            type="button"
            onClick={() => void projects.create({ name: t('newProject') })}
            className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            title={t('newProject')}
          >
            <Plus className="size-3.5" />
          </button>
        </div>

        {/* ── All Generations (drop = unassign from project) ── */}
        <button
          type="button"
          onClick={() => projects.setActiveProjectId(null)}
          onDragOver={(e) => handleDragOver(e, null)}
          onDragLeave={handleDragLeave}
          onDrop={(e) => void handleDrop(e, null)}
          className={cn(
            'mx-2 mb-1 flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm transition-colors',
            dropTargetId === null &&
              dropTargetId !== undefined &&
              'ring-2 ring-primary/40 bg-primary/5',
            !projects.activeProjectId
              ? 'bg-accent/70 text-accent-foreground font-medium'
              : 'text-muted-foreground hover:bg-accent/40 hover:text-foreground',
          )}
        >
          <Images className="size-4 shrink-0" />
          <span className="flex-1 truncate text-left">
            {t('allGenerations')}
          </span>
          <span className="rounded-full bg-muted px-2 py-0.5 text-2xs tabular-nums">
            {projects.historyTotal}
          </span>
        </button>

        {/* ── Project Tree (supports external drop from Gallery) */}
        <div
          className="flex-1 overflow-y-auto px-1"
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes('application/x-studio-ref')) {
              e.preventDefault()
              e.dataTransfer.dropEffect = 'copy'
              // Find closest project node by walking up DOM
              const target = (e.target as HTMLElement).closest(
                '[data-state]',
              ) as HTMLElement | null
              const accordionItem = target?.closest(
                '[data-orientation]',
              ) as HTMLElement | null
              // AccordionItem has value = project id
              const projectId =
                accordionItem
                  ?.querySelector('[data-state]')
                  ?.getAttribute('data-value') ?? null
              if (projectId) setDropTargetId(projectId)
            }
          }}
          onDragLeave={() => setDropTargetId(null)}
          onDrop={(e) => {
            e.preventDefault()
            setDropTargetId(null)
            const raw = e.dataTransfer.getData('application/x-studio-ref')
            if (!raw) return
            // Use the active project as target (the one user is hovering)
            const targetId = dropTargetId ?? projects.activeProjectId
            try {
              const { id: generationId } = JSON.parse(raw) as { id: string }
              if (generationId && targetId) {
                void assignToProjectAPI(generationId, targetId).then(() =>
                  projects.refresh(),
                )
              }
            } catch {
              // silently fail
            }
          }}
        >
          {treeData.length > 0 ? (
            <TreeView
              data={treeData}
              initialSelectedItemId={projects.activeProjectId ?? undefined}
              onSelectChange={(item) => {
                if (item) handleSelectProject(item.id)
              }}
              defaultNodeIcon={Folder}
              defaultLeafIcon={Folder}
              expandAll
              className="text-sm"
            />
          ) : (
            <p className="px-3 py-4 text-center text-xs text-muted-foreground">
              {t('noProjects')}
            </p>
          )}
        </div>

        {/* ── Separator ──────────────────────────────────────── */}
        <div className="mx-3 h-px bg-border/40" />

        {/* ── API Keys (compact) ─────────────────────────────── */}
        <div className="px-3 py-2">
          <p className="mb-1.5 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t('apiKeys')}
          </p>
          <div className="space-y-0.5">
            {/* Free tier */}
            <button
              type="button"
              onClick={() => {
                const workspaceOpt = modelOptions.find(
                  (o) => o.sourceType === 'workspace' && o.freeTier,
                )
                if (workspaceOpt) {
                  dispatch({
                    type: 'SET_OPTION_ID',
                    payload: workspaceOpt.optionId,
                  })
                }
              }}
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors',
                (!state.selectedOptionId ||
                  state.selectedOptionId?.startsWith('workspace:')) &&
                  'bg-accent/60 font-medium',
                'hover:bg-accent/40',
              )}
            >
              <Gift className="size-3 text-primary" />
              <span className="flex-1 text-left">PixelVault</span>
              <span className="text-2xs text-muted-foreground tabular-nums">
                {summary.freeGenerationLimit - summary.freeGenerationsToday}/
                {summary.freeGenerationLimit}
              </span>
            </button>

            {/* User keys */}
            {activeKeys.map((key) => {
              const matchingOption = modelOptions.find(
                (o) => o.keyId === key.id,
              )
              const isSelected =
                matchingOption?.optionId === state.selectedOptionId

              return (
                <button
                  key={key.id}
                  type="button"
                  onClick={() => {
                    if (matchingOption) {
                      dispatch({
                        type: 'SET_OPTION_ID',
                        payload: matchingOption.optionId,
                      })
                    }
                  }}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors',
                    isSelected && 'bg-accent/60 font-medium',
                    'hover:bg-accent/40',
                  )}
                >
                  <span
                    className="size-1.5 shrink-0 rounded-full"
                    style={{
                      background:
                        healthMap[key.id] === 'failed'
                          ? '#ef4444'
                          : healthMap[key.id] === 'available'
                            ? '#22c55e'
                            : '#a0a0a0',
                    }}
                  />
                  <span className="flex-1 truncate text-left">{key.label}</span>
                  <span className="text-2xs text-muted-foreground">
                    {key.providerConfig.label}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </SidebarContent>

      {/* ── Footer: Add API Key ────────────────────────────── */}
      <SidebarFooter>
        <button
          type="button"
          onClick={() => dispatch({ type: 'OPEN_PANEL', payload: 'civitai' })}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border/60 px-3 py-1.5 text-xs text-muted-foreground transition-all hover:border-primary/30 hover:text-primary active:scale-[0.97]"
        >
          <Key className="size-3" />
          {t('addApiKey')}
        </button>
      </SidebarFooter>
    </Sidebar>
  )
})
