'use client'

import { VideoComposer } from '../composer/VideoComposer'
import type { NodeDetailBodyProps } from './registry'

/**
 * Detail body for video (Seedance) nodes = the full B2 model-aware composer.
 * The compact card carries only the model chip + summary + generate; everything
 * else lives here (two-tier switcher, provider, prompt, references, params).
 */
export function VideoDetailBody({ nodeId, data }: NodeDetailBodyProps) {
  const mediaUrl = typeof data.mediaUrl === 'string' ? data.mediaUrl.trim() : ''

  return (
    <div className="space-y-4">
      {mediaUrl ? (
        <div className="aspect-video overflow-hidden rounded-xl border border-node-panel-inner bg-node-canvas">
          <video
            src={mediaUrl}
            className="h-full w-full object-contain"
            controls
            muted
            playsInline
            preload="metadata"
          />
        </div>
      ) : null}
      <VideoComposer id={nodeId} data={data} density="detail" />
    </div>
  )
}
