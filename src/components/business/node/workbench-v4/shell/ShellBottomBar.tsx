'use client'

/**
 * 底栏（S7 §7 · 画板 `ChromeOverview.dc.html` 底部胶囊）：
 * 选择 / 手 · 缩放% · 适配 · 整理 ‖ 撤销 / 重做。**没有加号**。
 *
 * ⚠ 相机动作直接用 ReactFlow 自己的 `zoomIn/zoomOut/fitView`，⛔ 不另存一份缩放
 * state：真值在 RF store 里，存第二份必然漂。
 */

import { useReactFlow, useStore } from '@xyflow/react'
import {
  Frame,
  Grid2x2,
  Hand,
  MousePointer2,
  Redo2,
  Undo2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { useTranslations } from 'next-intl'

import { CANVAS_SHELL_LAYOUT } from '@/constants/canvas-shell'
import {
  NODE_STUDIO_CANVAS,
  NODE_STUDIO_TOOL_MODE_IDS,
  type NodeStudioToolMode,
} from '@/constants/node-studio'

import { ShellIconButton } from './ShellIconButton'

export interface ShellBottomBarProps {
  readonly toolMode: NodeStudioToolMode
  onToolModeChange(mode: NodeStudioToolMode): void
  readonly canUndo: boolean
  readonly canRedo: boolean
  onUndo(): void
  onRedo(): void
  onTidyLayout(): void
}

export function ShellBottomBar({
  toolMode,
  onToolModeChange,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onTidyLayout,
}: ShellBottomBarProps) {
  const t = useTranslations('StudioNode.shell.bottom')
  const { zoomIn, zoomOut, fitView } = useReactFlow()
  const zoom = useStore((state) => state.transform[2])
  const percent = Math.round(zoom * 100)

  return (
    <div
      data-testid="shell-bottom-bar"
      style={{
        bottom: CANVAS_SHELL_LAYOUT.edgeInsetPx,
        borderRadius: CANVAS_SHELL_LAYOUT.glassRadiusPx,
      }}
      className="canvas-glass pointer-events-auto absolute left-1/2 z-canvas-chrome inline-flex -translate-x-1/2 items-center gap-0.5 p-1"
    >
      <ShellIconButton
        icon={MousePointer2}
        label={t('select')}
        testId="shell-tool-select"
        active={toolMode === NODE_STUDIO_TOOL_MODE_IDS.pointer}
        onClick={() => onToolModeChange(NODE_STUDIO_TOOL_MODE_IDS.pointer)}
      />
      <ShellIconButton
        icon={Hand}
        label={t('hand')}
        testId="shell-tool-hand"
        active={toolMode === NODE_STUDIO_TOOL_MODE_IDS.hand}
        onClick={() => onToolModeChange(NODE_STUDIO_TOOL_MODE_IDS.hand)}
      />
      <span className="mx-1 h-5 w-px bg-node-panel-inner" aria-hidden />
      <ShellIconButton
        icon={ZoomOut}
        label={t('zoomOut')}
        onClick={() => void zoomOut()}
      />
      <span
        data-testid="shell-zoom-level"
        aria-label={t('zoom', { percent })}
        className="px-1.5 text-2xs tabular-nums text-node-foreground"
      >
        {percent}%
      </span>
      <ShellIconButton
        icon={ZoomIn}
        label={t('zoomIn')}
        onClick={() => void zoomIn()}
      />
      <ShellIconButton
        icon={Frame}
        label={t('fit')}
        testId="shell-fit-view"
        onClick={() =>
          void fitView({ maxZoom: NODE_STUDIO_CANVAS.fitViewMaxZoom })
        }
      />
      <ShellIconButton
        icon={Grid2x2}
        label={t('tidy')}
        testId="shell-tidy"
        onClick={onTidyLayout}
      />
      <span className="mx-1 h-5 w-px bg-node-panel-inner" aria-hidden />
      <ShellIconButton
        icon={Undo2}
        label={t('undo')}
        disabled={!canUndo}
        onClick={onUndo}
      />
      <ShellIconButton
        icon={Redo2}
        label={t('redo')}
        disabled={!canRedo}
        onClick={onRedo}
      />
    </div>
  )
}
