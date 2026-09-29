'use client'

/**
 * 底栏（S7 §7 · 画板 `ChromeOverview.dc.html` 底部胶囊）：
 * 选择 / 手 · 缩放% · 适配 · 整理 ‖ 撤销 / 重做。**没有加号**。
 *
 * ⚠ 相机动作直接用 ReactFlow 自己的 `zoomIn/zoomOut/fitView`，⛔ 不另存一份缩放
 * state：真值在 RF store 里，存第二份必然漂。
 *
 * 选择 / 手是一对分段：选中底块在两颗之间滑（分段 thumb 走 slot 弹簧，motion canon），
 * ⛔ 不是两颗各自瞬间换底色。
 */

import { useReactFlow, useStore } from '@xyflow/react'
import { motion, useReducedMotion } from 'motion/react'
import {
  Frame,
  Grid2x2,
  Hand,
  MousePointer2,
  Redo2,
  Undo2,
  ZoomIn,
  ZoomOut,
} from '@/components/icons'
import { useTranslations } from 'next-intl'

import { CANVAS_SHELL_LAYOUT } from '@/constants/canvas-shell'
import { SPRING } from '@/constants/motion'
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
  const reduce = useReducedMotion()
  const handActive = toolMode === NODE_STUDIO_TOOL_MODE_IDS.hand

  return (
    <div
      data-testid="shell-bottom-bar"
      style={{
        bottom: CANVAS_SHELL_LAYOUT.edgeInsetPx,
        borderRadius: CANVAS_SHELL_LAYOUT.glassRadiusPx,
      }}
      className="canvas-glass pointer-events-auto absolute left-1/2 z-canvas-chrome inline-flex -translate-x-1/2 items-center gap-0.5 p-1"
    >
      <div className="relative flex items-center gap-0.5">
        {/* 选中底块：与按钮自己那块按下底同尺寸同圆角同色；排在按钮之前，按钮抬成
            `relative` 压在它上面。位移 = 一格按钮 + 一道 gap-0.5（2px）。 */}
        <motion.span
          aria-hidden
          data-testid="shell-tool-indicator"
          className="pointer-events-none absolute top-0 left-0 bg-node-panel-inner"
          style={{
            width: CANVAS_SHELL_LAYOUT.iconButtonPx,
            height: CANVAS_SHELL_LAYOUT.iconButtonPx,
            borderRadius: CANVAS_SHELL_LAYOUT.iconButtonRadiusPx,
          }}
          initial={false}
          animate={{ x: handActive ? CANVAS_SHELL_LAYOUT.iconButtonPx + 2 : 0 }}
          transition={reduce ? { duration: 0 } : SPRING.slot}
        />
        <ShellIconButton
          icon={MousePointer2}
          label={t('select')}
          testId="shell-tool-select"
          active={!handActive}
          externalActiveSurface
          onClick={() => onToolModeChange(NODE_STUDIO_TOOL_MODE_IDS.pointer)}
        />
        <ShellIconButton
          icon={Hand}
          label={t('hand')}
          testId="shell-tool-hand"
          active={handActive}
          externalActiveSurface
          onClick={() => onToolModeChange(NODE_STUDIO_TOOL_MODE_IDS.hand)}
        />
      </div>
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
