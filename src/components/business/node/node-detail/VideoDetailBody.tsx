'use client'

import { VideoComposer } from '../composer/VideoComposer'
import type { NodeDetailBodyProps } from './registry'

/**
 * Detail body for video (Seedance) nodes = the full B2 model-aware composer.
 * The compact card carries only the model chip + summary + generate; everything
 * else lives here (two-tier switcher, provider, prompt, references, params).
 */
export function VideoDetailBody({ nodeId, data }: NodeDetailBodyProps) {
  return <VideoComposer id={nodeId} data={data} density="detail" />
}
