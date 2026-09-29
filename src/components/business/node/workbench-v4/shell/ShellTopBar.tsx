'use client'

/**
 * 外壳顶部（S7 §7 · 画板 `ChromeOverview.dc.html`）：**左上项目胶囊 + 右上两颗**。
 *
 * ⚠ 右上现在**只剩「剪辑台」**。原顶栏（`CanvasTopBar`）的节点数 / 保存 / 添加 /
 * 审阅 / 画布外观全部退场 —— 保存态收进胶囊那颗点，添加改走无加号三条路
 * （双击 / 右键 / ⌘K）。
 *
 * ⚠ **「助手」胶囊已删**（D7b ④，owner 2026-09-20）：同一位置换成 Dock 自己那颗
 * **人设头像**（`StudioOperatorAvatarToggle`，一颗 fixed 元素，收起 ↔ 面板头部两个
 * 锚点）。这里为它**留位**——右侧那一格往左推一个头像 + 一个空隙，头像因此正好
 * 排在「剪辑台」右边。⛔ 别把胶囊找回来：画布上助手的开合只认那颗头像与 Esc 梯。
 */

import { Scissors } from '@/components/icons'
import { motion, useTransform } from 'motion/react'
import { useTranslations } from 'next-intl'

import { CANVAS_SHELL_LAYOUT } from '@/constants/canvas-shell'
import { STUDIO_OPERATOR_SHELL } from '@/constants/studio-assistant-operator'
import { useStudioOperatorYield } from '@/hooks/use-studio-operator-yield'
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
}: ShellTopBarProps) {
  const t = useTranslations('StudioNode.shell')
  const operatorYield = useStudioOperatorYield()
  const editDeskRight = useTransform(
    operatorYield,
    (value) =>
      value +
      CANVAS_SHELL_LAYOUT.edgeInsetPx +
      STUDIO_OPERATOR_SHELL.avatarSizePx +
      STUDIO_OPERATOR_SHELL.avatarGapPx +
      2,
  )

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

      <motion.div
        className="pointer-events-none absolute z-canvas-chrome flex gap-2"
        style={{
          right: editDeskRight,
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
      </motion.div>
    </>
  )
}
