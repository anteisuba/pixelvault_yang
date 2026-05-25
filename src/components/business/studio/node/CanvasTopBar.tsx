'use client'

import type { MouseEvent } from 'react'
import {
  Archive,
  Check,
  ChevronDown,
  FolderOpen,
  FolderPlus,
  LayoutTemplate,
  Pencil,
  Plus,
  Save,
  Trash2,
  Workflow,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { NODE_STUDIO_PLACEHOLDER_TOAST } from '@/constants/node-studio'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import type { NodeWorkflowProjectSummary } from '@/types/node-workflow'

interface CanvasTopBarProps {
  nodeCount: number
  projectName: string
  projects: NodeWorkflowProjectSummary[]
  currentProjectId: string
  onAddClick?: (event: MouseEvent<HTMLButtonElement>) => void
  onArrange?: () => void
  onCreateProject: () => void
  onRenameProject: () => void
  onDeleteProject: () => void
  onSwitchProject: (id: string) => void
  className?: string
}

export function CanvasTopBar({
  nodeCount,
  projectName,
  projects,
  currentProjectId,
  onAddClick,
  onArrange,
  onCreateProject,
  onRenameProject,
  onDeleteProject,
  onSwitchProject,
  className,
}: CanvasTopBarProps) {
  const t = useTranslations('StudioNode')
  const otherProjects = projects.filter(
    (project) => project.id !== currentProjectId,
  )

  const showPlaceholderToast = () => {
    toast.info(t('toasts.notImplemented'), {
      duration: NODE_STUDIO_PLACEHOLDER_TOAST.durationMs,
      position: NODE_STUDIO_PLACEHOLDER_TOAST.position,
    })
  }

  return (
    <header
      className={cn(
        'pointer-events-auto absolute left-4 right-4 top-4 flex min-h-14 items-center justify-between gap-3 rounded-3xl border border-node-panel-inner/70 bg-node-panel/95 px-3 py-2 shadow-node-panel backdrop-blur-xl md:left-6 md:right-6',
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-2xl bg-node-panel-inner text-node-amber">
          <Workflow className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="text-2xs font-semibold uppercase tracking-nav-dense text-node-muted">
            {t('eyebrow')}
          </p>
          <div className="flex min-w-0 items-center gap-2">
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label={t('projectMenu.triggerLabel')}
                  className="group flex min-w-0 items-center gap-1 rounded-lg text-left font-display text-sm font-semibold text-node-foreground outline-none transition hover:text-node-amber focus-visible:ring-2 focus-visible:ring-node-amber/70"
                >
                  <span className="truncate">{projectName}</span>
                  <ChevronDown className="size-3.5 shrink-0 text-node-muted transition group-data-[state=open]:rotate-180" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                className="w-72 border-node-panel-inner bg-node-panel text-node-foreground shadow-node-panel"
              >
                <DropdownMenuLabel className="text-2xs uppercase tracking-nav-dense text-node-muted">
                  {t('projectMenu.current')}
                </DropdownMenuLabel>
                <DropdownMenuItem
                  disabled
                  className="flex items-center gap-2 text-node-foreground opacity-100"
                >
                  <Check className="size-4 text-node-amber" />
                  <span className="min-w-0 flex-1 truncate">{projectName}</span>
                  <span className="shrink-0 text-2xs text-node-muted">
                    {t('nodeCount', { count: nodeCount })}
                  </span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={onRenameProject}
                  className="gap-2 focus:bg-node-panel-inner focus:text-node-foreground"
                >
                  <Pencil className="size-4 text-node-muted" />
                  {t('projectMenu.rename')}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={onDeleteProject}
                  className="gap-2 text-destructive focus:bg-node-panel-inner focus:text-destructive"
                >
                  <Trash2 className="size-4" />
                  {t('projectMenu.delete')}
                </DropdownMenuItem>
                {otherProjects.length > 0 && (
                  <>
                    <DropdownMenuSeparator className="bg-node-panel-inner" />
                    <DropdownMenuLabel className="text-2xs uppercase tracking-nav-dense text-node-muted">
                      {t('projectMenu.switch')}
                    </DropdownMenuLabel>
                    {otherProjects.map((project) => (
                      <DropdownMenuItem
                        key={project.id}
                        onClick={() => onSwitchProject(project.id)}
                        className="gap-2 focus:bg-node-panel-inner focus:text-node-foreground"
                      >
                        <FolderOpen className="size-4 shrink-0 text-node-muted" />
                        <span className="min-w-0 flex-1 truncate">
                          {project.name}
                        </span>
                        <span className="shrink-0 text-2xs text-node-muted">
                          {t('nodeCount', { count: project.nodeCount })}
                        </span>
                      </DropdownMenuItem>
                    ))}
                  </>
                )}
                <DropdownMenuSeparator className="bg-node-panel-inner" />
                <DropdownMenuItem
                  onClick={onCreateProject}
                  className="gap-2 focus:bg-node-panel-inner focus:text-node-foreground"
                >
                  <FolderPlus className="size-4 text-node-amber" />
                  {t('projectMenu.create')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <span className="hidden items-center gap-1 rounded-lg border border-node-panel-inner bg-node-panel-soft px-2 py-1 text-2xs font-medium text-node-muted sm:inline-flex">
              <Archive className="size-3" />
              {t('nodeCount', { count: nodeCount })}
            </span>
          </div>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <Button
          type="button"
          size="sm"
          onClick={onAddClick ?? showPlaceholderToast}
          className="h-9 rounded-2xl bg-node-foreground px-3 text-node-canvas hover:bg-node-foreground/90"
        >
          <Plus className="size-4" />
          <span className="hidden sm:inline">{t('topbar.addNode')}</span>
        </Button>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label={t('topbar.arrange')}
          title={t('topbar.arrange')}
          onClick={onArrange ?? showPlaceholderToast}
          disabled={nodeCount === 0}
          className="rounded-2xl text-node-muted hover:bg-node-panel-inner hover:text-node-foreground disabled:opacity-40"
        >
          <LayoutTemplate className="size-4" />
        </Button>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label={t('topbar.save')}
          onClick={showPlaceholderToast}
          className="rounded-2xl text-node-muted hover:bg-node-panel-inner hover:text-node-foreground"
        >
          <Save className="size-4" />
        </Button>
      </div>
    </header>
  )
}
