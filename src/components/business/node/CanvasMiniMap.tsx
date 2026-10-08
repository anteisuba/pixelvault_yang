'use client'

import { useState } from 'react'
import { Map, ChevronDown } from '@/components/icons'

import { MiniMap } from '@xyflow/react'
import { motion, useReducedMotion } from 'motion/react'
import { useTranslations } from 'next-intl'
import { motionTransition } from '@/constants/motion'

/**
 * 画布右下的小地图（S7 §7：**常显可收**）。
 *
 * ⛔ 不再按「图上没有节点」隐藏：空项目里它一样在那儿，收放是用户自己的开关。
 * 藏起来的那一版让「小地图去哪了」变成一个要靠猜的问题 —— 一个会自己消失的
 * 控件，用户第二次找不到它时不会想到是因为画布空了。
 */
export function CanvasMiniMap({
  hidden = false,
}: {
  readonly hidden?: boolean
}) {
  const t = useTranslations('StudioNode')
  const tShell = useTranslations('StudioNode.shell.minimap')
  const [expanded, setExpanded] = useState(true)
  const reduceMotion = useReducedMotion()

  return (
    <motion.div
      animate={{ opacity: hidden ? 0 : 1 }}
      transition={motionTransition('base', reduceMotion)}
      inert={hidden}
      aria-hidden={hidden}
      className={
        hidden
          ? 'pointer-events-none absolute bottom-4 right-4'
          : 'pointer-events-auto absolute bottom-4 right-4'
      }
    >
      <button
        type="button"
        aria-label={expanded ? tShell('collapse') : tShell('expand')}
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
        className={
          expanded
            ? 'absolute right-1 top-1 z-10 flex size-7 items-center justify-center rounded-md text-node-foreground canvas-glass'
            : 'flex h-8 items-center gap-1 rounded-lg border border-node-panel-inner px-2 text-node-foreground canvas-glass'
        }
      >
        {!expanded ? <Map className="size-4" aria-hidden /> : null}
        <ChevronDown
          className={expanded ? 'size-3' : 'size-3 rotate-180'}
          aria-hidden
        />
      </button>
      {expanded ? (
        <MiniMap
          ariaLabel={t('minimapTitle')}
          position="bottom-left"
          pannable
          zoomable
          nodeColor="var(--canvas-stroke-bold)"
          nodeStrokeColor="var(--canvas-ink-subtle)"
          nodeStrokeWidth={1.5}
          maskColor="color-mix(in oklab, var(--canvas-bg) 72%, transparent)"
          maskStrokeColor="var(--canvas-accent)"
          bgColor="transparent"
          style={{
            border: 0,
            borderRadius:
              'calc((var(--radius-node-bar) + var(--radius-node-thumb)) / 2)',
            boxShadow: 'var(--shadow-node-chrome)',
            // 小地图是外壳浮层：毛玻璃照挂（owner 2026-10-08 画布换皮，v2 §1 第 12 条）。
          }}
          className="canvas-glass pointer-events-auto !relative !bottom-auto !left-auto !m-0 !h-32 !w-48.5 cursor-grab overflow-hidden active:cursor-grabbing"
        />
      ) : null}
    </motion.div>
  )
}
