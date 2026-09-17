'use client'

/**
 * 左上**项目胶囊**与项目切换弹层（S7 §7 顶部 · 画板 `ChromeProject.dc.html`）。
 *
 * 胶囊 = 保存状态点 · 名 · ▾；点开 = 搜索 · 最近项目行（缩略 · 节点数 · 更新时间）
 * · 新建 ⌘N；重命名 / 复制 / 删除在 ⋯（接现有 `ProjectNameDialog` / 删除确认弹窗，
 * ⛔ 不新造第二套项目弹窗）。
 *
 * ⚠ 只做「选哪个项目」这件事：项目的读写全部走 `useNodeWorkflowStore` 的既有出口，
 * 本组件不碰存储。
 */

import { useMemo, useState } from 'react'
import {
  Check,
  ChevronDown,
  MoreHorizontal,
  Plus,
  Search,
} from '@/components/icons'
import { useFormatter, useTranslations } from 'next-intl'

import { CANVAS_SHELL_LAYOUT } from '@/constants/canvas-shell'
import { cn } from '@/lib/utils'
import type { NodeWorkflowProjectSummary } from '@/types/node-workflow'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'

export interface ShellProjectPillProps {
  readonly projectName: string
  readonly projects: readonly NodeWorkflowProjectSummary[]
  readonly currentProjectId: string
  readonly isSaving: boolean
  onSwitchProject(id: string): void
  onCreateProject(): void
  onRenameProject(): void
  onDuplicateProject(): void
  onDeleteProject(): void
}

export function ShellProjectPill({
  projectName,
  projects,
  currentProjectId,
  isSaving,
  onSwitchProject,
  onCreateProject,
  onRenameProject,
  onDuplicateProject,
  onDeleteProject,
}: ShellProjectPillProps) {
  const t = useTranslations('StudioNode.shell.project')
  const format = useFormatter()
  /**
   * `relativeTime` 的**参照时刻**。⚠ 不传 `now`，next-intl 退回全局默认值并且每渲染
   * 一行就往 console 甩一条 `ENVIRONMENT_FALLBACK`（真机实测一屏 30 多条）。取一次
   * 存住 —— 这是弹开看一眼的列表，⛔ 不为它上一个每秒走的钟。
   */
  const [now] = useState(() => new Date())
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const ordered = [...projects].sort((a, b) =>
      a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0,
    )
    if (!needle) return ordered
    return ordered.filter((project) =>
      project.name.toLowerCase().includes(needle),
    )
  }, [projects, query])

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setQuery('')
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid="shell-project-pill"
          aria-label={t('open')}
          style={{ height: CANVAS_SHELL_LAYOUT.pillHeightPx }}
          className="canvas-glass pointer-events-auto inline-flex items-center gap-2 rounded-full pl-2.5 pr-3 text-node-foreground"
        >
          <span
            data-testid="shell-project-save-dot"
            aria-label={isSaving ? t('saving') : t('saved')}
            title={isSaving ? t('saving') : t('saved')}
            className={cn(
              'size-1.5 rounded-full',
              isSaving ? 'bg-node-muted' : 'bg-node-status-done-fg',
            )}
          />
          <span className="max-w-40 truncate canvas-panel-title">
            {projectName}
          </span>
          <ChevronDown
            className="size-4 shrink-0 text-node-muted"
            aria-hidden
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={CANVAS_SHELL_LAYOUT.panelGapPx}
        aria-label={t('open')}
        data-testid="shell-project-popover"
        style={{ width: CANVAS_SHELL_LAYOUT.projectPopoverWidthPx }}
        className="rounded-xl border p-1.5 shadow-node-menu"
      >
        <div className="flex h-9 items-center gap-2 px-2.5 text-node-muted">
          <Search className="size-4 shrink-0" aria-hidden />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('search')}
            aria-label={t('search')}
            data-testid="shell-project-search"
            className="min-w-0 flex-1 bg-transparent text-sm text-node-foreground outline-none placeholder:text-node-muted"
          />
        </div>
        <div className="my-1.5 h-px bg-node-panel-inner" aria-hidden />
        <div className="max-h-72 overflow-y-auto">
          {matches.length === 0 ? (
            <p className="px-2.5 py-3 text-2xs text-node-muted">{t('empty')}</p>
          ) : (
            matches.map((project) => {
              const current = project.id === currentProjectId
              return (
                <div
                  key={project.id}
                  style={{ height: CANVAS_SHELL_LAYOUT.projectRowHeightPx }}
                  className={cn(
                    'flex items-center gap-2.5 rounded-lg px-2',
                    current && 'bg-node-panel-inner',
                  )}
                >
                  <button
                    type="button"
                    data-testid="shell-project-row"
                    onClick={() => {
                      onSwitchProject(project.id)
                      setOpen(false)
                    }}
                    className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                  >
                    <span
                      aria-hidden
                      style={{
                        width: CANVAS_SHELL_LAYOUT.projectThumbWidthPx,
                        height: CANVAS_SHELL_LAYOUT.projectThumbHeightPx,
                      }}
                      className="shrink-0 rounded-md bg-node-panel-soft"
                    />
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-sm text-node-foreground">
                        {project.name}
                      </span>
                      <span className="truncate text-2xs text-node-muted">
                        {t('nodeCount', { count: project.nodeCount })}
                        {' · '}
                        {format.relativeTime(new Date(project.updatedAt), now)}
                      </span>
                    </span>
                  </button>
                  {current ? (
                    <>
                      <Check
                        className="size-4 shrink-0 text-node-muted"
                        aria-hidden
                      />
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            aria-label={t('more')}
                            title={t('more')}
                            data-testid="shell-project-more"
                            className="flex size-6 shrink-0 items-center justify-center rounded-md text-node-muted transition-colors hover:text-node-foreground"
                          >
                            <MoreHorizontal className="size-4" aria-hidden />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onSelect={() => {
                              setOpen(false)
                              onRenameProject()
                            }}
                          >
                            {t('rename')}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={() => {
                              setOpen(false)
                              onDuplicateProject()
                            }}
                          >
                            {t('duplicate')}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            variant="destructive"
                            onSelect={() => {
                              setOpen(false)
                              onDeleteProject()
                            }}
                          >
                            {t('delete')}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </>
                  ) : null}
                </div>
              )
            })
          )}
        </div>
        <div className="mb-1 mt-1.5 h-px bg-node-panel-inner" aria-hidden />
        <button
          type="button"
          data-testid="shell-project-create"
          onClick={() => {
            setOpen(false)
            onCreateProject()
          }}
          className="flex h-8 w-full items-center gap-2.5 rounded-lg px-2.5 text-sm text-node-foreground transition-colors hover:bg-node-panel-inner"
        >
          <Plus className="size-4 shrink-0 text-node-muted" aria-hidden />
          <span>{t('new')}</span>
          <kbd className="ml-auto rounded border border-node-panel-inner px-1.5 text-2xs text-node-muted">
            ⌘N
          </kbd>
        </button>
      </PopoverContent>
    </Popover>
  )
}
