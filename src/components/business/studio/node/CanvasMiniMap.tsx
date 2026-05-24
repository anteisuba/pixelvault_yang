'use client'

import { MiniMap } from '@xyflow/react'
import { useTranslations } from 'next-intl'

export function CanvasMiniMap() {
  const t = useTranslations('StudioNode')

  return (
    <MiniMap
      ariaLabel={t('minimapTitle')}
      position="bottom-left"
      pannable={false}
      zoomable={false}
      nodeColor="var(--node-panel-inner)"
      nodeStrokeColor="var(--node-amber)"
      maskColor="color-mix(in oklab, var(--node-canvas) 58%, transparent)"
      maskStrokeColor="var(--node-muted)"
      bgColor="var(--node-panel)"
      className="!bottom-24 !left-4 !m-0 !h-28 !w-40 overflow-hidden rounded-2xl border border-node-panel-inner/80 shadow-node-panel md:!bottom-28 md:!left-6"
    />
  )
}
