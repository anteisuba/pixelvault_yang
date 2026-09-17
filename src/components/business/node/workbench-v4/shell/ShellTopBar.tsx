'use client'

/**
 * 外壳顶部（S7 §7 · 画板 `ChromeOverview.dc.html`）：**左上项目胶囊 + 右上两颗**。
 *
 * ⚠ 右上只有「剪辑台」「助手」。原顶栏（`CanvasTopBar`）的节点数 / 保存 / 添加 /
 * 审阅 / 画布外观全部退场 —— 保存态收进胶囊那颗点，添加改走无加号三条路
 * （双击 / 右键 / ⌘K）。
 */

import { Bot, Scissors } from '@/components/icons'
import { useTranslations } from 'next-intl'

import { CANVAS_SHELL_LAYOUT } from '@/constants/canvas-shell'
import type { NodeWorkflowProjectSummary } from '@/types/node-workflow'

import { ShellProjectPill } from './ShellProjectPill'

export interface ShellTopBarProps {
  readonly projectName: string
  readonly projects: readonly NodeWorkflowProjectSummary[]
  readonly currentProjectId: string
  readonly isSaving: boolean
  onSwitchProject(id: string): void
  onCreateProject(): void
  onRenameProject(): void
  onDuplicateProject(): void
  onDeleteProject(): void
  onOpenEditDesk(): void
  onOpenAssistant(): void
  readonly assistantOpen: boolean
}

export function ShellTopBar({
  projectName,
  projects,
  currentProjectId,
  isSaving,
  onSwitchProject,
  onCreateProject,
  onRenameProject,
  onDuplicateProject,
  onDeleteProject,
  onOpenEditDesk,
  onOpenAssistant,
  assistantOpen,
}: ShellTopBarProps) {
  const t = useTranslations('StudioNode.shell')

  return (
    <>
      <div
        className="pointer-events-none absolute z-canvas-chrome"
        style={{
          left: CANVAS_SHELL_LAYOUT.edgeInsetPx,
          top: CANVAS_SHELL_LAYOUT.edgeInsetPx,
        }}
      >
        <ShellProjectPill
          projectName={projectName}
          projects={projects}
          currentProjectId={currentProjectId}
          isSaving={isSaving}
          onSwitchProject={onSwitchProject}
          onCreateProject={onCreateProject}
          onRenameProject={onRenameProject}
          onDuplicateProject={onDuplicateProject}
          onDeleteProject={onDeleteProject}
        />
      </div>

      <div
        className="pointer-events-none absolute z-canvas-chrome flex gap-2"
        style={{
          right: CANVAS_SHELL_LAYOUT.edgeInsetPx,
          top: CANVAS_SHELL_LAYOUT.edgeInsetPx,
        }}
      >
        <button
          type="button"
          data-testid="shell-edit-desk"
          onClick={onOpenEditDesk}
          style={{ height: CANVAS_SHELL_LAYOUT.pillHeightPx }}
          className="canvas-glass pointer-events-auto inline-flex items-center gap-1.5 rounded-full px-3 text-xs text-node-foreground"
        >
          <Scissors className="size-4 shrink-0" aria-hidden />
          <span>{t('editDesk')}</span>
        </button>
        <button
          type="button"
          data-testid="shell-assistant-toggle"
          aria-pressed={assistantOpen}
          onClick={onOpenAssistant}
          style={{ height: CANVAS_SHELL_LAYOUT.pillHeightPx }}
          className="canvas-glass pointer-events-auto inline-flex items-center gap-1.5 rounded-full px-3 text-xs text-node-foreground"
        >
          <Bot className="size-4 shrink-0" aria-hidden />
          <span>{t('assistant')}</span>
        </button>
      </div>
    </>
  )
}
