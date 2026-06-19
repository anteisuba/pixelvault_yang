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
    <MiniMap
      ariaLabel={t('minimapTitle')}
      position="bottom-left"
      pannable
      zoomable
      nodeColor="var(--node-panel-inner)"
      nodeStrokeColor="var(--node-subtle)"
      maskColor="color-mix(in oklab, var(--node-canvas) 58%, transparent)"
      maskStrokeColor="var(--node-muted)"
      bgColor="var(--node-panel)"
      className="!bottom-24 !left-4 !m-0 !h-32 !w-48 overflow-hidden rounded-2xl border border-node-panel-inner/80 shadow-node-panel md:!bottom-28 md:!left-6"
    />
  )
}
