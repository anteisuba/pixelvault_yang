'use client'

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Folder,
  FolderOpen,
  FolderPlus,
  Images,
  Pencil,
  Plus,
  Trash2,
  Gift,
} from 'lucide-react'
import { useTranslations } from 'next-intl'

import { dropTargetForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter'

import { assignToProjectAPI } from '@/lib/api-client'
import { useStudioData, useStudioForm } from '@/contexts/studio-context'
import { useApiKeysContext } from '@/contexts/api-keys-context'
import { useImageModelOptions } from '@/hooks/use-image-model-options'
import { useAudioModelOptions } from '@/hooks/use-audio-model-options'
import { useVideoModelOptions } from '@/hooks/use-video-model-options'
import { getModelById } from '@/constants/models'
import { useUsageSummary } from '@/hooks/use-usage-summary'
import { TreeView, type TreeDataItem } from '@/components/ui/tree-view'
import type { ProjectRecord } from '@/types'
import { Sidebar, SidebarContent, SidebarFooter } from '@/components/ui/sidebar'
import { ApiKeyDrawerTrigger } from '@/components/business/ApiKeyDrawerTrigger'
import { ApiKeyManager } from '@/components/business/ApiKeyManager'
import { cn } from '@/lib/utils'

// ─── Project name → Tree structure ──────────────────────────────

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
    <span className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
      <span
        role="button"
        tabIndex={0}
        onClick={(e) => {
          e.stopPropagation()
          const newName = prompt('Rename project:', projectName)
          if (newName?.trim()) onRename(projectId, newName.trim())
        }}
        className="flex size-5 cursor-pointer items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
        title="Rename"
      >
        <Pencil className="size-2.5" />
      </span>
      <span
        role="button"
        tabIndex={0}
        onClick={(e) => {
          e.stopPropagation()
          onAddSub(projectName)
        }}
        className="flex size-5 cursor-pointer items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
        title="Add sub-project"
      >
        <FolderPlus className="size-2.5" />
      </span>
      <span
        role="button"
        tabIndex={0}
        onClick={(e) => {
          e.stopPropagation()
          onDelete(projectId)
        }}
        className="flex size-5 cursor-pointer items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        title="Delete"
      >
        <Trash2 className="size-2.5" />
      </span>
    </span>
  )
}

function buildProjectTree(
  projects: ProjectRecord[],
  onSelect: (id: string) => void,
  onRename: (id: string, name: string) => void,
  onAddSub: (parentName: string) => void,
  onDelete: (id: string) => void,
): TreeDataItem[] {
  const roots: TreeDataItem[] = []
  const nodeMap = new Map<string, TreeDataItem>()

  const sorted = [...projects].sort((a, b) => a.name.localeCompare(b.name))

  for (const project of sorted) {
    const parts = project.name.split(' / ').map((p) => p.trim())

    const node: TreeDataItem = {
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

  function cleanEmpty(items: TreeDataItem[]) {
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
  const { modelOptions: imageModelOptions } = useImageModelOptions()
  const { modelOptions: audioModelOptions } = useAudioModelOptions()
  const { modelOptions: videoModelOptions } = useVideoModelOptions(
    state.selectedOptionId ?? '',
  )
  const modelOptions =
    state.outputType === 'audio'
      ? audioModelOptions
      : state.outputType === 'video'
        ? videoModelOptions
        : imageModelOptions
  const allModelOptions = [
    ...imageModelOptions,
    ...audioModelOptions,
    ...videoModelOptions,
  ]
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

  // ── Drag & Drop: move generation to project (Pragmatic DnD) ──

  const canAcceptExternalDrop = useCallback(
    (data: Record<string, unknown>) => data.type === 'studio-generation',
    [],
  )

  const onExternalDrop = useCallback(
    (item: TreeDataItem, data: Record<string, unknown>) => {
      const generationId = data.generationId as string
      if (!generationId) return
      void assignToProjectAPI(generationId, item.id).then(() =>
        projects.refresh(),
      )
    },
    [projects],
  )

  // "All Generations" button — Pragmatic DnD drop target (unassign from project)
  const allBtnRef = useRef<HTMLButtonElement>(null)
  const [isDragOverAll, setIsDragOverAll] = useState(false)

  useEffect(() => {
    const el = allBtnRef.current
    if (!el) return
    return dropTargetForElements({
      element: el,
      canDrop: ({ source }) => source.data.type === 'studio-generation',
      onDragEnter: () => setIsDragOverAll(true),
      onDragLeave: () => setIsDragOverAll(false),
      onDrop: ({ source }) => {
        setIsDragOverAll(false)
        const generationId = source.data.generationId as string
        if (!generationId) return
        void assignToProjectAPI(generationId, null).then(() =>
          projects.refresh(),
        )
      },
    })
  }, [projects])

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
        {/* ── Projects section (hidden in quick mode) ────────── */}
        {state.workflowMode !== 'quick' && (
          <>
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
              ref={allBtnRef}
              type="button"
              onClick={() => projects.setActiveProjectId(null)}
              className={cn(
                'mx-2 mb-1 flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm transition-colors',
                isDragOverAll && 'ring-2 ring-primary/40 bg-primary/5',
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

            {/* ── Project Tree (drop to specific project node) ──── */}
            <div className="flex-1 overflow-y-auto px-1">
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
                  onExternalDrop={onExternalDrop}
                  canAcceptExternalDrop={canAcceptExternalDrop}
                />
              ) : (
                <p className="px-3 py-4 text-center text-xs text-muted-foreground">
                  {t('noProjects')}
                </p>
              )}
            </div>

            {/* ── Separator ──────────────────────────────────────── */}
            <div className="mx-3 h-px bg-border/40" />
          </>
        )}

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
              const matchingOption = allModelOptions.find(
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
                      // Auto-switch outputType based on model
                      const model = getModelById(matchingOption.modelId)
                      if (model) {
                        const targetMode =
                          model.outputType === 'AUDIO'
                            ? 'audio'
                            : model.outputType === 'VIDEO'
                              ? 'video'
                              : 'image'
                        if (state.outputType !== targetMode) {
                          dispatch({
                            type: 'SET_OUTPUT_TYPE',
                            payload: targetMode,
                          })
                        }
                      }
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
        <ApiKeyDrawerTrigger className="h-auto w-full rounded-lg border-dashed border-border/60 bg-transparent px-3 py-1.5 text-xs text-muted-foreground shadow-none hover:border-primary/30 hover:bg-transparent hover:text-primary">
          <ApiKeyManager />
        </ApiKeyDrawerTrigger>
      </SidebarFooter>
    </Sidebar>
  )
})
