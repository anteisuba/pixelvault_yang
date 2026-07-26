'use client'

import { MiniMap, useNodes } from '@xyflow/react'
import { useTranslations } from 'next-intl'

export function CanvasMiniMap() {
  const t = useTranslations('StudioNode')
  const nodes = useNodes()

  if (nodes.length === 0) {
    return null
  }

  return (
    // 蓝图纸（施工图 §3/§9-S4）：独立 --node-blueprint-* token，与画布暖炭
    // node-canvas/node-panel 系材质区分。nodeColor 与 bgColor 同值让节点填
    // 充融进底色，只剩 nodeStrokeColor 线框可见 = "线框感"；节点位置仍靠
    // 线框轮廓可辨。maskStrokeColor 同步换蓝图线（原 node-muted 暖灰在深青
    // 底上会读成材质混用）。
    <MiniMap
      ariaLabel={t('minimapTitle')}
      position="bottom-left"
      pannable
      zoomable
      nodeColor="var(--node-blueprint-bg)"
      nodeStrokeColor="var(--node-blueprint-line)"
      nodeStrokeWidth={1.5}
      maskColor="color-mix(in oklab, var(--node-blueprint-bg) 58%, transparent)"
      maskStrokeColor="var(--node-blueprint-line)"
      bgColor="var(--node-blueprint-bg)"
      // S2b（2026-07-26）：左下角现在被左侧合体面板占着，minimap 必须让开。
      // 靠 --canvas-minimap-left 定位，值由 StudioNodeWorkbench 按面板展开态给：
      // 展开 = 面板宽 + 间距，收起 = 图标轨宽 + 间距。作用域外（无该变量时）
      // 回退到原来的贴边值，不影响任何非画布消费者。
      style={{ left: 'var(--canvas-minimap-left, 1rem)' }}
      className="!bottom-24 !m-0 !h-32 !w-48 overflow-hidden rounded-2xl border border-node-blueprint-line/40 shadow-node-panel md:!bottom-28"
    />
  )
}
