'use client'

/**
 * 选中时浮出的那两样（工具条在卡上方、提示词栏在卡下方，spec §1.4）的**开合外壳**。
 *
 * 方向 A「从卡上长出来」（§1 第 12 条）：工具条以卡顶边中点、提示词栏以卡底边中点为
 * 原点长出来，取消选中时反着缩回去。⚠ ReactFlow 的 `NodeToolbar` 一收到
 * `isVisible=false` 就当场卸掉，退场根本来不及播 —— 所以这里自己记着「还在场」，
 * 退场播完（`onExitComplete`）才真正让它下场。
 *
 * **跟着画布缩放**（owner 2026-09-29「大小比例应该合理」）：缩小画布时两样一起缩，
 * 下限 0.6、放大不超过 1（`NODE_V4_CHROME_SCALE`）。缩放包在开合动画**外面**的那一层，
 * 原点同样落在卡边上 —— 缩了之后仍贴着卡，⛔ 和开合的 scale 写在同一个元素上互相覆盖。
 */

import { useState, type ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import {
  NodeToolbar as FlowNodeToolbar,
  Position,
  useStore,
} from '@xyflow/react'

import { NODE_V4_CHROME_SCALE } from '@/constants/node-studio'

import { FADE_ONLY, GROW_FROM_EDGE } from './chrome-motion'

/** ReactFlow `NodeToolbar` 离卡的默认距离 —— 原点要落在卡边上，得把它算进去。 */
const FLOW_TOOLBAR_OFFSET = 10

export function NodeChromeLayer({
  show,
  position,
  children,
}: {
  readonly show: boolean
  readonly position: typeof Position.Top | typeof Position.Bottom
  readonly children: ReactNode
}) {
  const reduce = useReducedMotion()
  const scale = useStore((state) =>
    Math.min(
      NODE_V4_CHROME_SCALE.max,
      Math.max(NODE_V4_CHROME_SCALE.min, state.transform[2]),
    ),
  )
  const [present, setPresent] = useState(show)
  if (show && !present) setPresent(true)
  const motionSet = reduce ? FADE_ONLY : GROW_FROM_EDGE
  const origin =
    position === Position.Top
      ? `50% calc(100% + ${FLOW_TOOLBAR_OFFSET}px)`
      : `50% -${FLOW_TOOLBAR_OFFSET}px`

  return (
    <FlowNodeToolbar isVisible={present} position={position}>
      <div
        data-node-chrome-scale={scale}
        style={{ transform: `scale(${scale})`, transformOrigin: origin }}
      >
        <AnimatePresence onExitComplete={() => setPresent(false)}>
          {show ? (
            <motion.div
              key="node-chrome"
              data-node-chrome-layer={position}
              style={{ transformOrigin: origin }}
              initial={motionSet.initial}
              animate={motionSet.animate}
              exit={motionSet.exit}
            >
              {children}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </FlowNodeToolbar>
  )
}
