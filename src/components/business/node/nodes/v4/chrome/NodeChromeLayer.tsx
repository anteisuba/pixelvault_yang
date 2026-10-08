'use client'

/** 选中节点的浮层：跟随画布逐帧定位，并在开合动画结束后卸载。 */

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import {
  NodeToolbar as FlowNodeToolbar,
  Position,
  useNodeId,
  useStore,
} from '@xyflow/react'
import { shallow } from 'zustand/shallow'

import { CANVAS_SHELL_SAFE_LEFT_DEFAULT_PX } from '@/constants/canvas-shell'

import { useNodeV4Canvas } from '../NodeV4Context'
import { GROW_FROM_EDGE, REDUCED_GROW_FROM_EDGE } from './chrome-motion'
import { layoutNodeChrome } from './node-chrome-safe-area'

/** 卡名 16px 行高 + 6px 底距；NodeCardShell 已将它留在卡面上方。 */
const NAME_ROW_HEIGHT = 22

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
  const nodeId = useNodeId()
  const { safeLeftPx = CANVAS_SHELL_SAFE_LEFT_DEFAULT_PX } = useNodeV4Canvas()
  const geometry = useStore((state) => {
    const node = state.nodeLookup?.get(nodeId ?? '')
    const [panX, panY, zoom] = state.transform
    const nodeX = node?.internals.positionAbsolute.x ?? 0
    const nodeY = node?.internals.positionAbsolute.y ?? 0
    const nodeWidth = node?.measured?.width ?? node?.width ?? 0
    const nodeHeight = node?.measured?.height ?? node?.height ?? 0
    return {
      width: state.width ?? 0,
      height: state.height ?? 0,
      zoom,
      cardX: panX + nodeX * zoom,
      cardY: panY + nodeY * zoom + NAME_ROW_HEIGHT,
      cardWidth: nodeWidth * zoom,
      cardHeight: Math.max(0, nodeHeight * zoom - NAME_ROW_HEIGHT),
    }
  }, shallow)
  const contentRef = useRef<HTMLDivElement>(null)
  const [contentSize, setContentSize] = useState({ width: 0, height: 0 })
  const [present, setPresent] = useState(show)
  if (show && !present) setPresent(true)

  useLayoutEffect(() => {
    if (!present) return
    const content = contentRef.current
    if (!content) return
    const measure = () => {
      const width = content.offsetWidth
      const height = content.offsetHeight
      setContentSize((current) =>
        current.width === width && current.height === height
          ? current
          : { width, height },
      )
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(content)
    return () => observer.disconnect()
  }, [present])

  const layout = layoutNodeChrome({
    viewport: { width: geometry.width, height: geometry.height },
    card: {
      x: geometry.cardX,
      y: geometry.cardY,
      width: geometry.cardWidth,
      height: geometry.cardHeight,
    },
    zoom: geometry.zoom,
    safeLeft: safeLeftPx,
    content: contentSize,
    position,
  })
  const motionSet = reduce ? REDUCED_GROW_FROM_EDGE : GROW_FROM_EDGE
  const origin = `${layout.originX}px ${layout.originY}`
  const visible =
    geometry.cardWidth > 0 &&
    geometry.cardHeight > 0 &&
    contentSize.width > 0 &&
    contentSize.height > 0 &&
    layout.visible

  return (
    <FlowNodeToolbar
      isVisible={present}
      position={position}
      style={{
        transform: `translate(${layout.left}px, ${layout.top}px) scale(${layout.scale})`,
        transformOrigin: '0 0',
        visibility: visible ? 'visible' : 'hidden',
      }}
    >
      <div ref={contentRef} data-node-chrome-scale={layout.scale}>
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
