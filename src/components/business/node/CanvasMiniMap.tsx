'use client'

import { useState } from 'react'
import { Map, ChevronDown } from 'lucide-react'

import { MiniMap, useNodes } from '@xyflow/react'
import { useTranslations } from 'next-intl'

export function CanvasMiniMap() {
  const t = useTranslations('StudioNode')
  const nodes = useNodes()
  const [expanded, setExpanded] = useState(true)

  if (nodes.length === 0) {
    return null
  }

  return (
    <div className="pointer-events-auto absolute bottom-4 right-4">
      <button
        type="button"
        aria-label={t('minimapTitle')}
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
            border: '1px solid var(--canvas-stroke-regular)',
          }}
          className="canvas-glass pointer-events-auto !relative !bottom-auto !left-auto !m-0 !h-32 !w-48 cursor-grab overflow-hidden rounded-2xl active:cursor-grabbing"
        />
      ) : null}
    </div>
  )
}
