'use client'

/**
 * 底栏（S7 §7 · 画板 `ChromeOverview.dc.html` 底部胶囊）：
 * 选择 / 手 · 缩放% · 适配 · 整理 ‖ 撤销 / 重做 ‖ 角色 / 素材库。
 * ⚠ ≥768（`lg:`，本项目 `--breakpoint-lg` = 48rem）的 `/studio` 外壳里末尾还会长出一颗「添加节点」
 * ＋（在它正上方弹 `CanvasAddMenu`，开着时呈按下态，⛔ 不开左侧面板）和侧栏那几格面板入口
 * （`SHELL_CANVAS_DESK_BOTTOM_ENTRIES`）；< 768 它们是藏着的。
 *
 * ⭐ 角色 / 素材库两颗（owner 2026-10-08）：侧栏「画布」下面只留原型四格，这两格搬到
 *   底栏（= `SHELL_CANVAS_BOTTOM_ENTRIES`，侧栏那张列表没收走的格子）。点一颗打开的仍是侧栏旁边**同一块**左侧面板（`ShellSidePanels`，开着哪格是
 *   `use-canvas-shell-panel` 那一份），再点收起；按钮就是底栏这一颗，⛔ 不另起样式。
 *
 * ⚠ 缩放直接用 ReactFlow 自己的 `zoomIn/zoomOut`，⛔ 不另存一份缩放 state：真值在
 * RF store 里，存第二份必然漂。「适应」例外：走工作台传进来的 `onFitView`，与打开
 * 项目时的自动适应同一个算式（2026-11-18 之前这里用 RF `fitView`，参数与自动适应
 * 两套，同一张图打开 13%、点适应 30%）。
 *
 * 选择 / 手是一对分段：选中底块在两颗之间滑（分段 thumb 走 slot 弹簧，motion canon），
 * ⛔ 不是两颗各自瞬间换底色。
 */

import { useRef, useState } from 'react'
import { useReactFlow, useStore } from '@xyflow/react'
import { motion, useReducedMotion, useTransform } from 'motion/react'
import {
  Frame,
  Grid2x2,
  Hand,
  MousePointer2,
  Plus,
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
import {
  SHELL_CANVAS_BOTTOM_ENTRIES,
  SHELL_CANVAS_DESK_BOTTOM_ENTRIES,
} from '@/constants/navigation'
import { useStudioOperatorYield } from '@/features/assistant/hooks'
import { useToastLift } from '@/hooks/use-toast-lift'
import {
  NODE_STUDIO_TOOL_MODE_IDS,
  type NodeStudioToolMode,
} from '@/constants/node-studio'
import { studioShellPullAnchorProps } from '@/constants/studio-shell'

import {
  CanvasAddMenuPopover,
  type CanvasAddMenuActions,
} from './CanvasAddMenu'
import { ShellIconButton } from './ShellIconButton'

export interface ShellBottomBarProps {
  readonly toolMode: NodeStudioToolMode
  onToolModeChange(mode: NodeStudioToolMode): void
  readonly canUndo: boolean
  readonly canRedo: boolean
  onUndo(): void
  onRedo(): void
  onTidyLayout(): void
  /** 「适应」：与打开项目时的自动适应同一个算式（`fitCanvasProject`）。 */
  onFitView(): void
  /** 左侧面板开着哪一格（底栏的角色 / 素材库按它亮）。 */
  readonly activePanel: CanvasShellPanelId | null
  /** 点角色 / 素材库：没开 = 打开那一格，开着 = 收起。 */
  onTogglePanel(panel: CanvasShellPanelId): void
  /** 末尾 ＋ 弹的加节点菜单交出去的动作（卡落在可见区，与键盘 T/I/A/V 同一个落点）。 */
  readonly addMenu: CanvasAddMenuActions
}

export function ShellBottomBar({
  toolMode,
  onToolModeChange,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onTidyLayout,
  onFitView,
  activePanel,
  onTogglePanel,
  addMenu,
}: ShellBottomBarProps) {
  const [addMenuOpen, setAddMenuOpen] = useState(false)
  const t = useTranslations('StudioNode.shell.bottom')
  const tPanels = useTranslations('StudioNode.shell.panels')
  const { zoomIn, zoomOut } = useReactFlow()
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
      // 居中块：外壳「拉」时叠补偿平移（画布列是靠左锚，见 `studioShellPullCompensation`）；
      // 叠在 motion 的 `x`（inline transform）上，`-translate-x-1/2` 走的是 `translate` 属性，都不受影响。
      {...studioShellPullAnchorProps('center')}
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
        onClick={onFitView}
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
      {/* ≥768 `/studio` 外壳里侧栏不在了（第 9f 步）：侧栏下面那几格搬到这里。 */}
      <span className="hidden lg:contents">
        <span className="mx-1 h-5 w-px bg-node-panel-inner" aria-hidden />
        {/* 「添加节点」：在按钮正上方弹加节点菜单（居中对齐、离底栏 8），⛔ 不开左侧面板。 */}
        <CanvasAddMenuPopover
          open={addMenuOpen}
          onOpenChange={setAddMenuOpen}
          anchor="trigger"
          side="top"
          align="center"
          sideOffset={CANVAS_SHELL_LAYOUT.panelGapPx}
          testId="shell-bottom-add-menu"
          {...addMenu}
        >
          <ShellIconButton
            icon={Plus}
            label={tPanels('addNode')}
            testId="shell-bottom-add"
            active={addMenuOpen}
          />
        </CanvasAddMenuPopover>
        {SHELL_CANVAS_DESK_BOTTOM_ENTRIES.map((entry) => (
          <ShellIconButton
            key={entry.id}
            icon={entry.icon}
            label={tPanels(entry.id)}
            testId={`shell-bottom-desk-${entry.id}`}
            panelEntry={entry.id}
            active={activePanel === entry.id}
            onClick={() => onTogglePanel(entry.id)}
          />
        ))}
      </span>
    </motion.div>
  )
}
