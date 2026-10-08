'use client'

/**
 * 底栏（S7 §7 · 画板 `ChromeOverview.dc.html` 底部胶囊）：
 * 选择 / 手 · 缩放% · 适配 · 整理 ‖ 撤销 / 重做 ‖ 角色 / 素材库。**没有加号**。
 *
 * ⭐ 角色 / 素材库两颗（owner 2026-10-08）：侧栏「画布」下面只留原型四格，这两格搬到
 *   底栏（= `SHELL_CANVAS_BOTTOM_ENTRIES`，侧栏那张列表没收走的格子）。点一颗打开的仍是侧栏旁边**同一块**左侧面板（`ShellSidePanels`，开着哪格是
 *   `use-canvas-shell-panel` 那一份），再点收起；按钮就是底栏这一颗，⛔ 不另起样式。
 *
 * ⚠ 相机动作直接用 ReactFlow 自己的 `zoomIn/zoomOut/fitView`，⛔ 不另存一份缩放
 * state：真值在 RF store 里，存第二份必然漂。
 *
 * 选择 / 手是一对分段：选中底块在两颗之间滑（分段 thumb 走 slot 弹簧，motion canon），
 * ⛔ 不是两颗各自瞬间换底色。
 */

import { useRef } from 'react'
import { useReactFlow, useStore } from '@xyflow/react'
import { motion, useReducedMotion, useTransform } from 'motion/react'
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

import {
  CANVAS_SHELL_LAYOUT,
  type CanvasShellPanelId,
} from '@/constants/canvas-shell'
import { SPRING } from '@/constants/motion'
import { SHELL_CANVAS_BOTTOM_ENTRIES } from '@/constants/navigation'
import { useStudioOperatorYield } from '@/hooks/use-studio-operator-yield'
import { useToastLift } from '@/hooks/use-toast-lift'
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
  /** 左侧面板开着哪一格（底栏的角色 / 素材库按它亮）。 */
  readonly activePanel: CanvasShellPanelId | null
  /** 点角色 / 素材库：没开 = 打开那一格，开着 = 收起。 */
  onTogglePanel(panel: CanvasShellPanelId): void
}

export function ShellBottomBar({
  toolMode,
  onToolModeChange,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onTidyLayout,
  activePanel,
  onTogglePanel,
}: ShellBottomBarProps) {
  const t = useTranslations('StudioNode.shell.bottom')
  const tPanels = useTranslations('StudioNode.shell.panels')
  const { zoomIn, zoomOut, fitView } = useReactFlow()
  const zoom = useStore((state) => state.transform[2])
  const percent = Math.round(zoom * 100)
  const reduce = useReducedMotion()
  const handActive = toolMode === NODE_STUDIO_TOOL_MODE_IDS.hand
  // 助手推开画布时（方向 B），底栏跟着可见画布居中：往左挪让位量的一半。
  const shift = useTransform(useStudioOperatorYield(), (value) => -value / 2)
  // 底部黑条（全站 toast）浮在这条底栏之上（owner 2026-10-08「提示与弹窗」）。
  const barRef = useRef<HTMLDivElement>(null)
  useToastLift(barRef)

  return (
    <motion.div
      ref={barRef}
      data-testid="shell-bottom-bar"
      style={{
        bottom: CANVAS_SHELL_LAYOUT.edgeInsetPx,
        borderRadius: CANVAS_SHELL_LAYOUT.glassRadiusPx,
        x: shift,
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
      {/* 侧栏没收走的面板入口（现在是角色 / 素材库；哪几格在这里只看
          `SHELL_NAV_CANVAS_ENTRIES`）。一格都没有时连分隔线一起不画。 */}
      {SHELL_CANVAS_BOTTOM_ENTRIES.length > 0 ? (
        <span className="mx-1 h-5 w-px bg-node-panel-inner" aria-hidden />
      ) : null}
      {SHELL_CANVAS_BOTTOM_ENTRIES.map((entry) => (
        <ShellIconButton
          key={entry.id}
          icon={entry.icon}
          label={tPanels(entry.id)}
          testId={`shell-bottom-${entry.id}`}
          panelEntry={entry.id}
          active={activePanel === entry.id}
          onClick={() => onTogglePanel(entry.id)}
        />
      ))}
    </motion.div>
  )
}
