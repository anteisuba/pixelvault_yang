'use client'

import { useRef } from 'react'
import { useMotionValueEvent } from 'motion/react'
import { useReactFlow } from '@xyflow/react'

import { studioOperatorYield } from '@/hooks/use-studio-operator-yield'

/**
 * 助手打开把画布推窄时，**视口中心不动**（node-canvas-v2 §1 第 4 条 · 方向 B「助手推开
 * 画布」）。
 *
 * 画布容器右边让出 Δ，ReactFlow 的视口是左上角锚定的 —— 不补的话，原本在屏幕右半边的
 * 卡被挤出可见区，等于还是被盖住。每一帧按让位量的**一半**往左平移，中心那张卡原地
 * 不动。让位量由助手面板那根液态弹簧驱动，所以视口跟面板同一根弹簧走（画板动效表：
 * 「画布视口跟着面板一起变窄 / 变宽」）。代价画板上写了：每次开合助手都会挪一次视口。
 */
export function useKeepCanvasCenterOnYield(): void {
  const { getViewport, setViewport } = useReactFlow()
  const last = useRef(studioOperatorYield.get())
  useMotionValueEvent(studioOperatorYield, 'change', (value) => {
    const delta = value - last.current
    last.current = value
    if (delta === 0) return
    const viewport = getViewport()
    void setViewport({
      x: viewport.x - delta / 2,
      y: viewport.y,
      zoom: viewport.zoom,
    })
  })
}
