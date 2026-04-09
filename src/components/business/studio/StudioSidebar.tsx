'use client'

import { memo, useCallback, useMemo } from 'react'
import { Key, Folder, FolderOpen, Images, Plus, Gift } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { useStudioData, useStudioForm } from '@/contexts/studio-context'
import { useApiKeysContext } from '@/contexts/api-keys-context'
import { useImageModelOptions } from '@/hooks/use-image-model-options'
import { useUsageSummary } from '@/hooks/use-usage-summary'
import { TreeView } from '@/components/ui/tree-view'
import type { ProjectRecord } from '@/types'
import { cn } from '@/lib/utils'

// ─── Project name → Tree structure ──────────────────────────────

interface TreeItem {
  id: string
  name: string
  icon?: React.ComponentType<{ className?: string }>
  selectedIcon?: React.ComponentType<{ className?: string }>
  openIcon?: React.ComponentType<{ className?: string }>
  children?: TreeItem[]
  onClick?: () => void
  droppable?: boolean
}

function buildProjectTree(
  projects: ProjectRecord[],
  onSelect: (id: string) => void,
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

  const treeData = useMemo(
    () => buildProjectTree(projects.projects, handleSelectProject),
    [projects.projects, handleSelectProject],
  )

  return (
    <div className="flex h-full flex-col border-r border-border/40 bg-background/50">
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

      {/* ── All Generations ────────────────────────────────── */}
      <button
        type="button"
        onClick={() => projects.setActiveProjectId(null)}
        className={cn(
          'mx-2 mb-1 flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm transition-colors',
          !projects.activeProjectId
            ? 'bg-accent/70 text-accent-foreground font-medium'
            : 'text-muted-foreground hover:bg-accent/40 hover:text-foreground',
        )}
      >
        <Images className="size-4 shrink-0" />
        <span className="flex-1 truncate text-left">{t('allGenerations')}</span>
        <span className="rounded-full bg-muted px-2 py-0.5 text-2xs tabular-nums">
          {projects.historyTotal}
        </span>
      </button>

      {/* ── Project Tree ───────────────────────────────────── */}
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
            const matchingOption = modelOptions.find((o) => o.keyId === key.id)
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

      {/* ── Footer: Add API Key ────────────────────────────── */}
      <div className="px-3 pb-3">
        <button
          type="button"
          onClick={() => dispatch({ type: 'OPEN_PANEL', payload: 'civitai' })}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border/60 px-3 py-1.5 text-xs text-muted-foreground transition-all hover:border-primary/30 hover:text-primary active:scale-[0.97]"
        >
          <Key className="size-3" />
          {t('addApiKey')}
        </button>
      </div>
    </div>
  )
})
