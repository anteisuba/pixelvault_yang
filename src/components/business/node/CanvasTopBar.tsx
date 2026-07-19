'use client'

import type { MouseEvent } from 'react'
import {
  Archive,
  Check,
  ChevronDown,
  Clock3,
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
import { Spinner } from '@/components/ui/spinner'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import type {
  CanvasAppearance,
  NodeWorkflowProjectSummary,
} from '@/types/node-workflow'

import { CanvasAppearancePanel } from './CanvasAppearancePanel'

interface CanvasTopBarProps {
  nodeCount: number
  projectName: string
  projects: NodeWorkflowProjectSummary[]
  currentProjectId: string
  canvasAppearance: CanvasAppearance | undefined
  onCanvasAppearanceChange(value: CanvasAppearance | undefined): void
  onAddClick?: (event: MouseEvent<HTMLButtonElement>) => void
  onArrange?: () => void
  onSave?: () => void
  isSaving?: boolean
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
  canvasAppearance,
  onCanvasAppearanceChange,
  onAddClick,
  onArrange,
  onSave,
  isSaving = false,
  onCreateProject,
  onRenameProject,
  onDeleteProject,
  onSwitchProject,
  className,
}: CanvasTopBarProps) {
  const t = useTranslations('StudioNode')

  const currentProject = projects.find(
    (project) => project.id === currentProjectId,
  )
  const otherProjects = projects.filter(
    (project) => project.id !== currentProjectId,
  )
  const updatedLabel = currentProject
    ? t('projectMenu.updatedAt', {
        time: new Date(currentProject.updatedAt).toLocaleString(),
      })
    : t('projectMenu.unsaved')

  const showPlaceholderToast = () => {
    toast.info(t('toasts.notImplemented'), {
      duration: NODE_STUDIO_PLACEHOLDER_TOAST.durationMs,
      position: NODE_STUDIO_PLACEHOLDER_TOAST.position,
    })
  }

  return (
    <header
      className={cn(
        'pointer-events-auto absolute left-3 right-3 top-3 flex h-12 items-center justify-between gap-3 rounded-xl border border-node-panel-inner bg-node-panel px-2 shadow-sm md:left-4 md:right-4',
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg text-node-paint">
          <Workflow className="size-4" />
        </span>
        <div className="flex min-w-0 items-center gap-2">
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={t('projectMenu.triggerLabel')}
                // 片名条（施工图 §3/§5 落点，S4）：唯一没有 .node-card-paper
                // 作用域类的纸卡消费点——按钮不是卡，挂类会把整个深 chrome
                // 顶栏拖成纸色。逐元素显式换 card-paper/card-ink 系工具类。
                className="group flex h-8 min-w-0 items-center gap-1.5 rounded-lg px-2 text-left outline-none transition hover:bg-node-panel-inner focus-visible:ring-2 focus-visible:ring-node-focus-ring/70"
              >
                <span className="truncate font-display text-sm font-semibold text-node-foreground">
                  {projectName}
                </span>
                {isSaving ? (
                  <Spinner size="sm" className="text-node-muted" />
                ) : null}
                <ChevronDown className="size-3.5 shrink-0 text-node-muted transition group-data-[state=open]:rotate-180" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              // w-60 on phone-portrait keeps the menu under ~60% of the
              // viewport so the canvas behind stays partly visible; sm+
              // restores the original 288px width for more breathing room.
              className="w-60 border-node-panel-inner bg-node-panel text-node-foreground shadow-node-panel sm:w-72"
            >
              <DropdownMenuLabel className="text-2xs uppercase tracking-nav-dense text-node-muted">
                {t('projectMenu.current')}
              </DropdownMenuLabel>
              <div className="mx-1 rounded-2xl border border-node-panel-inner bg-node-panel-soft p-3">
                <div className="flex items-start gap-2">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-node-panel-inner text-node-foreground">
                    <Check className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-node-foreground">
                      {projectName}
                    </p>
                    <p className="mt-1 flex items-center gap-1 text-2xs font-medium text-node-muted">
                      <Clock3 className="size-3" />
                      <span suppressHydrationWarning className="truncate">
                        {isSaving ? t('projectMenu.saving') : updatedLabel}
                      </span>
                    </p>
                  </div>
                  <span className="shrink-0 rounded-lg bg-node-panel-inner px-2 py-1 text-2xs font-semibold text-node-muted">
                    {t('nodeCount', { count: nodeCount })}
                  </span>
                </div>
              </div>
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
                <FolderPlus className="size-4 text-node-foreground" />
                {t('projectMenu.create')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <span className="hidden items-center gap-1 rounded-md px-1.5 py-1 text-2xs font-medium text-node-muted sm:inline-flex">
            <Archive className="size-3" />
            {t('nodeCount', { count: nodeCount })}
          </span>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <Button
          type="button"
          size="sm"
          onClick={onAddClick ?? showPlaceholderToast}
          // 纸色反相丸（§5 落点⑤/§3）：深 chrome 顶栏上唯一的纸色 CTA，呼应
          // 片名条材质，与右侧图标钮组（仍走深 chrome hover）区分主/次动作。
          className="h-9 rounded-2xl bg-node-card-paper px-3 text-node-card-ink hover:bg-node-card-paper-strong"
        >
          <Plus className="size-4" />
          <span className="hidden sm:inline">{t('topbar.addNode')}</span>
        </Button>
        <CanvasAppearancePanel
          appearance={canvasAppearance}
          onChange={onCanvasAppearanceChange}
        />
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
          title={t('topbar.save')}
          onClick={onSave ?? showPlaceholderToast}
          disabled={isSaving}
          className="rounded-2xl text-node-muted hover:bg-node-panel-inner hover:text-node-foreground disabled:opacity-50"
        >
          {isSaving ? <Spinner size="md" /> : <Save className="size-4" />}
        </Button>
      </div>
    </header>
  )
}
