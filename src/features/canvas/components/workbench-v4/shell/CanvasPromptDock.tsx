'use client'

/**
 * 画布区底部正中那块**停靠区**（2026-11-21 定稿 `canvas-card.html`「改成」）：选中卡的
 * 提示词栏由卡自己经传送门（`NodePromptDock`）渲染进来。
 *
 * 几何：水平居中于**画布可视区**（左侧面板开着从面板右缘算、助手推窄时右边跟着让），
 * 栏底在底栏上方 8px，宽 540、可视区窄于 572 时左右各留 16 撑满。屏幕空间浮层，
 * ⛔ 不随画布缩放 / 平移。
 *
 * 层级：平时在卡与连线之上、外壳 chrome（顶栏 / 底栏 / 菜单）之下；画中框开着时
 * 抬到框的遮罩之上（`canvas.css` 的 `[data-frame-open]`）—— 框里那张卡还用这一条。
 */

import type { Ref } from 'react'
import { motion } from 'motion/react'

import { CANVAS_PROMPT_DOCK } from '@/constants/canvas-shell'
import { studioShellPullAnchorProps } from '@/constants/studio-shell'
import { useStudioOperatorYield } from '@/features/assistant/hooks'

export interface CanvasPromptDockProps {
  /** 可视区左界（`canvasPromptDockRegionLeftPx`）。 */
  readonly regionLeftPx: number
  /** 画中框开着：抬到遮罩之上。 */
  readonly frameOpen: boolean
  /** 卡往里传送的那个节点。 */
  readonly targetRef: Ref<HTMLDivElement>
}

export function CanvasPromptDock({
  regionLeftPx,
  frameOpen,
  targetRef,
}: CanvasPromptDockProps) {
  // 助手推窄画布时（方向 B），可视区右缘跟着让 —— 与画布区自己的 `right` 同一个值。
  const operatorYield = useStudioOperatorYield()
  return (
    <motion.div
      data-canvas-prompt-dock-region
      // 居中块（栏在区里 `justify-center`）：外壳「拉」时叠补偿平移；这一层自己没有 transform。
      {...studioShellPullAnchorProps('center')}
      data-frame-open={frameOpen ? 'true' : undefined}
      style={{ left: regionLeftPx, right: operatorYield }}
      className="canvas-prompt-dock-region pointer-events-none absolute inset-y-0 z-canvas-selection"
    >
      <div
        ref={targetRef}
        data-canvas-prompt-dock
        style={{ bottom: CANVAS_PROMPT_DOCK.bottomPx }}
        className="canvas-prompt-dock absolute inset-x-4 flex justify-center"
      />
    </motion.div>
  )
}
