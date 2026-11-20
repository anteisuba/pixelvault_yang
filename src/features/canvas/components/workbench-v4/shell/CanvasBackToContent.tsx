'use client'

/**
 * 「回到内容」：画布上有卡、但一张都不在视口里时，浮在底栏正上方的一颗胶囊。
 *
 * 判据是纯函数 `isCanvasContentLost`（jsdom 没布局，几何只在那里测）；点下去走
 * 底栏「适应」**同一个**动作（`onFitView` = 工作台的 `fitAllNodes`），⛔ 不另写一套相机。
 */

import { useStore } from '@xyflow/react'
import { AnimatePresence, motion, useTransform } from 'motion/react'
import { useTranslations } from 'next-intl'

import { CANVAS_SHELL_LAYOUT } from '@/constants/canvas-shell'
import { DURATION, EASE_STANDARD } from '@/constants/motion'
import { Locate } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { useStudioOperatorYield } from '@/features/assistant/hooks'

import {
  isCanvasContentLost,
  type CanvasCameraNode,
} from '../node-canvas-camera'

/** 底栏：边距 16 + 图标键（32）+ 上下 p-1（8）；再空一道 panelGap。 */
const ABOVE_BOTTOM_BAR_PX =
  CANVAS_SHELL_LAYOUT.edgeInsetPx +
  CANVAS_SHELL_LAYOUT.iconButtonPx +
  8 +
  CANVAS_SHELL_LAYOUT.panelGapPx

export function CanvasBackToContent({ onFitView }: { onFitView(): void }) {
  const t = useTranslations('StudioNode.shell.bottom')
  const lost = useStore((state) => {
    const [x, y, zoom] = state.transform
    const nodes: CanvasCameraNode[] = []
    for (const node of state.nodeLookup.values()) {
      const width = node.measured.width ?? 0
      const height = node.measured.height ?? 0
      if (!width || !height) continue
      nodes.push({
        x: node.internals.positionAbsolute.x,
        y: node.internals.positionAbsolute.y,
        width,
        height,
      })
    }
    return isCanvasContentLost(
      { width: state.width, height: state.height },
      { x, y, zoom },
      nodes,
    )
  })
  // 助手推开画布时与底栏同一个让位（底栏头注）。
  const shift = useTransform(useStudioOperatorYield(), (value) => -value / 2)

  return (
    <AnimatePresence>
      {lost ? (
        <motion.div
          key="back-to-content"
          data-testid="canvas-back-to-content"
          className="pointer-events-auto absolute left-1/2 z-canvas-chrome -translate-x-1/2"
          style={{ bottom: ABOVE_BOTTOM_BAR_PX, x: shift }}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 6 }}
          transition={{ duration: DURATION.base, ease: EASE_STANDARD }}
        >
          <Button variant="secondary" size="sm" onClick={onFitView}>
            <Locate aria-hidden />
            {t('backToContent')}
          </Button>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
